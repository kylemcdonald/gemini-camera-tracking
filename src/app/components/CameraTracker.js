'use client';

import { useEffect, useRef, useState } from 'react';
import jsfeat from 'jsfeat';

export default function CameraTracker() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [detections, setDetections] = useState([]);
  const [searchPrompt, setSearchPrompt] = useState('parts of the face');
  const [labelPrompt, setLabelPrompt] = useState('a representative emoji');
  const [isLoading, setIsLoading] = useState(false);
  const [showPointsDebug, setShowPointsDebug] = useState(true);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cleanCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const cleanCtxRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const detectionsRef = useRef([]);
  const facingModeRef = useRef('user');
  const showPointsDebugRef = useRef(true);
  
  // jsfeat point tracking refs
  const curpyrRef = useRef(null);
  const prevpyrRef = useRef(null);
  const pointCountRef = useRef(0);
  const pointStatusRef = useRef(null);
  const prevxyRef = useRef(null);
  const curxyRef = useRef(null);
  const origxyRef = useRef(null);
  const maxPoints = 1000;
  
  // Update refs when state changes
  useEffect(() => {
    detectionsRef.current = detections;
  }, [detections]);

  useEffect(() => {
    facingModeRef.current = facingMode;
  }, [facingMode]);
  
  useEffect(() => {
    showPointsDebugRef.current = showPointsDebug;
  }, [showPointsDebug]);
  
  // Initialize camera
  const startCamera = async () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: window.innerWidth },
          height: { ideal: window.innerHeight }
        }
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.style.display = 'none';
      }
      
      setIsCameraActive(true);
    } catch (err) {
      console.error('Error accessing camera:', err);
    }
  };
  
  // Flip camera
  const flipCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };
  
  // Clear detections
  const clearDetections = () => {
    setDetections([]);
  };
  
  // Clear tracking points
  const clearTrackingPoints = () => {
    pointCountRef.current = 0;
  };
  
  // Initialize tracking points in a grid pattern
  const initializeTrackingPointGrid = () => {
    if (!canvasRef.current || !ctxRef.current) return;
    
    // Clear existing tracking points first
    clearTrackingPoints();
    
    const canvas = canvasRef.current;
    
    // Calculate grid dimensions
    // Aim for a reasonable number of points (e.g., 30x20 grid = 600 points)
    const gridCols = 30;
    const gridRows = 20;
    const totalPoints = gridCols * gridRows;
    
    // Calculate spacing
    const spacingX = canvas.width / (gridCols + 1);
    const spacingY = canvas.height / (gridRows + 1);
    
    // Add grid points to tracking system
    let pointIndex = 0;
    for (let row = 1; row <= gridRows; row++) {
      for (let col = 1; col <= gridCols; col++) {
        // Calculate point coordinates
        const x = spacingX * col;
        const y = spacingY * row;
        
        // Add to tracking arrays
        curxyRef.current[pointIndex * 2] = x;
        curxyRef.current[pointIndex * 2 + 1] = y;
        prevxyRef.current[pointIndex * 2] = x;
        prevxyRef.current[pointIndex * 2 + 1] = y;
        origxyRef.current[pointIndex * 2] = x;
        origxyRef.current[pointIndex * 2 + 1] = y;
        
        pointIndex++;
        
        // Safety check to not exceed maxPoints
        if (pointIndex >= maxPoints) break;
      }
      // Safety check to not exceed maxPoints
      if (pointIndex >= maxPoints) break;
    }
    
    // Update point count
    pointCountRef.current = Math.min(totalPoints, maxPoints);
    
    console.log(`Created grid of ${pointCountRef.current} tracking points (${gridCols}x${gridRows})`);
    
    // Re-associate points with existing detections based on current bounding box positions
    if (detections.length > 0) {
      // First clear all existing associations
      detections.forEach(detection => {
        detection.associatedPoints = [];
        
        // Update initialBox to match current box position
        // This resets the reference point for tracking to the current position
        detection.initialBox = {
          xMin: detection.box.xMin,
          yMin: detection.box.yMin,
          xMax: detection.box.xMax,
          yMax: detection.box.yMax
        };
      });
      
      // Then re-associate based on current positions
      associatePointsWithDetections(detections);
    }
  };
  
  // Handle canvas click to add tracking points
  const handleCanvasClick = (event) => {
    if (pointCountRef.current < maxPoints && canvasRef.current) {
      // Get click coordinates relative to the canvas
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      
      // Add point to tracking array - only update curxy, not prevxy
      const pointIndex = pointCountRef.current * 2;
      curxyRef.current[pointIndex] = x;
      curxyRef.current[pointIndex + 1] = y;
      prevxyRef.current[pointIndex] = x;
      prevxyRef.current[pointIndex + 1] = y;
      origxyRef.current[pointIndex] = x;
      origxyRef.current[pointIndex + 1] = y;
      
      // Increment point count
      pointCountRef.current++;
      
      console.log(`Added tracking point at (${x}, ${y}), total: ${pointCountRef.current}`);
    }
  };
  
  // Detect objects using the proxy endpoint
  const detectObjects = async () => {
    if (!cleanCanvasRef.current) return;
    
    try {
      setIsLoading(true);
      
      // Initialize tracking point grid when detecting objects
      initializeTrackingPointGrid();
      
      // Capture current frame from clean canvas
      const imageData = cleanCanvasRef.current.toDataURL('image/jpeg');
      
      // Prepare the prompt
      const prompt = `Detect ${searchPrompt}, with no more than 10 items. Output a json list where each entry contains the 2D bounding box in "box_2d" and ${labelPrompt} in "label".`;
      
      // Call proxy endpoint
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          prompt,
          image: imageData
        }),
      });
      
      const detections = await res.json();
      console.log(detections);
      if (detections.error) {
        console.error('API Error:', detections.error);
        if (detections.originalText) {
          console.error('Original Gemini response:', detections.originalText);
        }
        throw new Error(detections.error);
      }
      
      // Process all detections at once
      const processedDetections = detections.map(detection => {
        const [yMin, xMin, yMax, xMax] = detection.box_2d;
        // Calculate center point for text placement
        const centerX = ((xMin + xMax) / 2 / 1000) * canvasRef.current.width;
        const centerY = ((yMin + yMax) / 2 / 1000) * canvasRef.current.height;
        
        return {
          x: centerX,
          y: centerY,
          label: detection.label,
          box: {
            xMin: (xMin / 1000) * canvasRef.current.width,
            yMin: (yMin / 1000) * canvasRef.current.height,
            xMax: (xMax / 1000) * canvasRef.current.width,
            yMax: (yMax / 1000) * canvasRef.current.height
          },
          associatedPoints: [], // Initialize array to store associated points
          initialBox: {  // Store initial box position to calculate relative movement
            xMin: (xMin / 1000) * canvasRef.current.width,
            yMin: (yMin / 1000) * canvasRef.current.height,
            xMax: (xMax / 1000) * canvasRef.current.width,
            yMax: (yMax / 1000) * canvasRef.current.height
          }
        };
      });

      // Associate tracking points with detections
      associatePointsWithDetections(processedDetections);

      // Set all detections at once
      setDetections(processedDetections);
    } catch (error) {
      console.error('Error calling API:', error);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Associate tracking points with detection bounding boxes
  const associatePointsWithDetections = (detections) => {
    if (!pointCountRef.current) return;
    
    for (const detection of detections) {
      for (let i = 0; i < pointCountRef.current; i++) {
        // Use current point positions instead of original positions
        const currentX = curxyRef.current[i * 2];
        const currentY = curxyRef.current[i * 2 + 1];
        
        // Check if the current point position is inside the current bounding box
        if (currentX >= detection.box.xMin && 
            currentX <= detection.box.xMax && 
            currentY >= detection.box.yMin && 
            currentY <= detection.box.yMax) {
          // Associate this point with the detection
          detection.associatedPoints.push(i);
        }
      }
      
      console.log(`Detection "${detection.label}" has ${detection.associatedPoints.length} associated points`);
    }
  };
  
  // Draw video frame to canvas
  const drawVideoToCanvas = () => {
    if (!videoRef.current || !canvasRef.current || !ctxRef.current || !cleanCanvasRef.current || !cleanCtxRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    const cleanCanvas = cleanCanvasRef.current;
    const cleanCtx = cleanCtxRef.current;
    
    // Calculate crop dimensions
    const videoRatio = video.videoWidth / video.videoHeight;
    const canvasRatio = canvas.width / canvas.height;
    
    let width, height, offsetX = 0, offsetY = 0;
    
    if (canvasRatio > videoRatio) {
      width = canvas.width;
      height = canvas.width / videoRatio;
      offsetY = (height - canvas.height) / -2;
    } else {
      height = canvas.height;
      width = canvas.height * videoRatio;
      offsetX = (width - canvas.width) / -2;
    }
    
    // Clear both canvases
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    cleanCtx.clearRect(0, 0, cleanCanvas.width, cleanCanvas.height);
    
    // Draw video frame with cropping on both canvases
    ctx.save();
    cleanCtx.save();
    
    if (facingModeRef.current === 'user') {
      ctx.scale(-1, 1);
      ctx.translate(-canvas.width, 0);
      cleanCtx.scale(-1, 1);
      cleanCtx.translate(-cleanCanvas.width, 0);
    }
    
    // Draw the cropped video on both canvases
    ctx.drawImage(
      video,
      offsetX < 0 ? -offsetX / (width / video.videoWidth) : 0,
      offsetY < 0 ? -offsetY / (height / video.videoHeight) : 0,
      video.videoWidth,
      video.videoHeight,
      offsetX > 0 ? offsetX : 0,
      offsetY > 0 ? offsetY : 0,
      width,
      height
    );
    
    cleanCtx.drawImage(
      video,
      offsetX < 0 ? -offsetX / (width / video.videoWidth) : 0,
      offsetY < 0 ? -offsetY / (height / video.videoHeight) : 0,
      video.videoWidth,
      video.videoHeight,
      offsetX > 0 ? offsetX : 0,
      offsetY > 0 ? offsetY : 0,
      width,
      height
    );
    
    ctx.restore();
    cleanCtx.restore();
    
    // If we have points to track, process optical flow
    if (pointCountRef.current > 0) {
      trackPoints(canvas);
    }
    
    // Update bounding box positions based on associated tracking points
    updateDetectionBoxes();
    
    // Draw detections with rectangles and labels
    ctx.font = '24px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    detectionsRef.current.forEach(detection => {
      if (detection.box) {
        // Draw the bounding box rectangle
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.lineWidth = 3;
        const boxWidth = detection.box.xMax - detection.box.xMin;
        const boxHeight = detection.box.yMax - detection.box.yMin;
        ctx.strokeRect(detection.box.xMin, detection.box.yMin, boxWidth, boxHeight);
        
        // Add a semi-transparent background for the label
        if (detection.label) {
          const textMetrics = ctx.measureText(detection.label);
          const textWidth = textMetrics.width;
          const textHeight = 30; // Approximate height based on font size
          
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(
            detection.box.xMin, 
            detection.box.yMin - textHeight, 
            textWidth + 10, 
            textHeight
          );
          
          // Draw the label text above the box
          ctx.fillStyle = 'white';
          ctx.fillText(
            detection.label, 
            detection.box.xMin + 5, 
            detection.box.yMin - textHeight + 5
          );
          
          // Optionally display the number of associated points
          if (showPointsDebugRef.current && detection.associatedPoints && detection.associatedPoints.length > 0) {
            const pointText = `${detection.associatedPoints.length} points`;
            ctx.fillText(
              pointText,
              detection.box.xMin + 5,
              detection.box.yMax + 5
            );
          }
        }
      }
    });
    
    // Draw tracking points with enhanced visualization only if debug display is enabled
    if (pointCountRef.current > 0 && showPointsDebugRef.current) {
      // Log number of points being drawn periodically (every 60 frames to avoid console spam)
      if (Math.random() < 0.01) {
        console.log(`Drawing ${pointCountRef.current} tracking points`);
      }
      
      // Draw lines connecting the previous and current points to show motion
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      
      for (let i = 0; i < pointCountRef.current; i++) {
        const curX = curxyRef.current[i * 2];
        const curY = curxyRef.current[i * 2 + 1];
        const prevX = prevxyRef.current[i * 2];
        const prevY = prevxyRef.current[i * 2 + 1];
        
        // Only draw the line if the points have moved significantly
        const distance = Math.sqrt(Math.pow(curX - prevX, 2) + Math.pow(curY - prevY, 2));
        if (distance > 1) {
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(curX, curY);
        }
      }
      ctx.stroke();
      
      // Draw lines from original position to current position
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255, 165, 0, 0.4)'; // Orange with lower opacity
      ctx.lineWidth = 1;
      
      for (let i = 0; i < pointCountRef.current; i++) {
        const curX = curxyRef.current[i * 2];
        const curY = curxyRef.current[i * 2 + 1];
        const origX = origxyRef.current[i * 2];
        const origY = origxyRef.current[i * 2 + 1];
        
        // Only draw the line if the current position differs from original
        const distanceFromOrigin = Math.sqrt(Math.pow(curX - origX, 2) + Math.pow(curY - origY, 2));
        if (distanceFromOrigin > 2) {
          ctx.moveTo(origX, origY);
          ctx.lineTo(curX, curY);
        }
      }
      ctx.stroke();
      
      // Draw the points themselves with different styles based on their motion
      for (let i = 0; i < pointCountRef.current; i++) {
        const x = curxyRef.current[i * 2];
        const y = curxyRef.current[i * 2 + 1];
        const prevX = prevxyRef.current[i * 2];
        const prevY = prevxyRef.current[i * 2 + 1];
        const origX = origxyRef.current[i * 2];
        const origY = origxyRef.current[i * 2 + 1];
        
        // Calculate point velocity/motion speed
        const distance = Math.sqrt(Math.pow(x - prevX, 2) + Math.pow(y - prevY, 2));
        const distanceFromOrigin = Math.sqrt(Math.pow(x - origX, 2) + Math.pow(y - origY, 2));
        
        // Adjust point size based on motion
        const pointSize = Math.min(8, 4 + distance / 2);
        
        // Choose color based on motion speed
        if (distance > 5) {
          // Fast moving point - use yellow
          ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
        } else if (distance > 1) {
          // Medium movement - use cyan
          ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
        } else {
          // Slow/stationary - use green
          ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
        }
        
        // Draw the actual point
        ctx.beginPath();
        ctx.arc(x, y, pointSize, 0, 2 * Math.PI);
        ctx.fill();
        
        // Add outline to points
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        
        // Draw original position marker if point has moved from its origin
        if (distanceFromOrigin > 2) {
          ctx.fillStyle = 'rgba(255, 165, 0, 0.6)'; // Orange with transparency
          ctx.beginPath();
          ctx.arc(origX, origY, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }
  };
  
  // Track points between frames using optical flow
  const trackPoints = (canvas) => {
    if (!canvas || pointCountRef.current === 0) return;
    
    // Swap buffers first - current becomes previous for next frame
    const xyswap = prevxyRef.current;
    prevxyRef.current = curxyRef.current;
    curxyRef.current = xyswap;
    
    const pyrswap = prevpyrRef.current;
    prevpyrRef.current = curpyrRef.current;
    curpyrRef.current = pyrswap;
    
    // These are options worth breaking out and exploring
    const winSize = 20;
    const maxIterations = 30;
    const epsilon = 0.01;
    const minEigen = 0.001;
    
    // Get grayscale image for current frame
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Convert to grayscale
    jsfeat.imgproc.grayscale(imageData.data, canvas.width, canvas.height, curpyrRef.current.data[0]);
    
    // Build image pyramid for current frame
    curpyrRef.current.build(curpyrRef.current.data[0], true);
    
    const point_status = new Uint8Array(100);
    // Run Lucas-Kanade optical flow
    jsfeat.optical_flow_lk.track(
      prevpyrRef.current, // previous pyramid
      curpyrRef.current,  // current pyramid
      prevxyRef.current,  // previous points
      curxyRef.current,   // current points
      pointCountRef.current, // number of points
      winSize,            // win_size
      maxIterations,      // max_iterations
      pointStatusRef.current, // status
      epsilon,            // epsilon
      minEigen            // min_eigen
    );
  };
  
  // Prune points that couldn't be tracked
  const prunePoints = () => {
    let outputPoint = 0;
    let removed = 0;
    
    // Log all point positions and statuses before pruning
    const pointDetails = [];
    for (let i = 0; i < pointCountRef.current; i++) {
      pointDetails.push({
        point: i,
        x: curxyRef.current[i * 2],
        y: curxyRef.current[i * 2 + 1],
        status: pointStatusRef.current[i]
      });
    }
    console.log('Points before pruning:', pointDetails);
    
    // Create a map to track point index changes
    const pointIndexMap = new Map();
    
    for (let inputPoint = 0; inputPoint < pointCountRef.current; inputPoint++) {
      // Status 1 means successfully tracked, anything else means couldn't track
      if (pointStatusRef.current[inputPoint] === 1) {
        if (outputPoint < inputPoint) {
          const inputIndex = inputPoint * 2;
          const outputIndex = outputPoint * 2;
          curxyRef.current[outputIndex] = curxyRef.current[inputIndex];
          curxyRef.current[outputIndex + 1] = curxyRef.current[inputIndex + 1];
          prevxyRef.current[outputIndex] = prevxyRef.current[inputIndex];
          prevxyRef.current[outputIndex + 1] = prevxyRef.current[inputIndex + 1];
          origxyRef.current[outputIndex] = origxyRef.current[inputIndex];
          origxyRef.current[outputIndex + 1] = origxyRef.current[inputIndex + 1];
        }
        // Record the new index for this point
        pointIndexMap.set(inputPoint, outputPoint);
        outputPoint++;
      } else {
        removed++;
      }
    }
    
    // Log if we're removing points
    if (removed > 0) {
      console.log(`Pruned ${removed} points, ${outputPoint} points remaining`);
      
      // Update all detection's associated points after pruning
      detectionsRef.current.forEach(detection => {
        if (detection.associatedPoints && detection.associatedPoints.length > 0) {
          // Create new array with updated indices, filtering out removed points
          const updatedPoints = [];
          for (const oldPointIndex of detection.associatedPoints) {
            const newPointIndex = pointIndexMap.get(oldPointIndex);
            if (newPointIndex !== undefined) {
              updatedPoints.push(newPointIndex);
            }
          }
          detection.associatedPoints = updatedPoints;
          console.log(`Detection "${detection.label}" now has ${updatedPoints.length} associated points after pruning`);
        }
      });
    }
    
    pointCountRef.current = outputPoint;
  };
  
  // Update detection bounding boxes based on tracking point movement
  const updateDetectionBoxes = () => {
    detectionsRef.current.forEach(detection => {
      if (!detection.associatedPoints || detection.associatedPoints.length < 2) {
        return; // Skip if no associated points or too few for standard deviation
      }
      
      // Variables for position tracking
      let totalDeltaX = 0;
      let totalDeltaY = 0;
      let validPoints = 0;
      
      // Arrays to store current and original positions for standard deviation calculation
      const currentXPositions = [];
      const currentYPositions = [];
      const originalXPositions = [];
      const originalYPositions = [];
      
      // Process all associated points
      for (const pointIndex of detection.associatedPoints) {
        // Skip if point index is out of bounds (might happen if points were pruned)
        if (pointIndex >= pointCountRef.current) continue;
        
        const currentX = curxyRef.current[pointIndex * 2];
        const currentY = curxyRef.current[pointIndex * 2 + 1];
        const origX = origxyRef.current[pointIndex * 2];
        const origY = origxyRef.current[pointIndex * 2 + 1];
        
        // Store positions for standard deviation calculation
        currentXPositions.push(currentX);
        currentYPositions.push(currentY);
        originalXPositions.push(origX);
        originalYPositions.push(origY);
        
        // Calculate displacement from original position
        const deltaX = currentX - origX;
        const deltaY = currentY - origY;
        
        totalDeltaX += deltaX;
        totalDeltaY += deltaY;
        validPoints++;
      }
      
      // Only update if we have valid points to consider
      if (validPoints > 0) {
        // Calculate average displacement
        const avgDeltaX = totalDeltaX / validPoints;
        const avgDeltaY = totalDeltaY / validPoints;
        
        // Calculate standard deviations to determine scale change
        const originalStdDevX = calculateStandardDeviation(originalXPositions);
        const originalStdDevY = calculateStandardDeviation(originalYPositions);
        const currentStdDevX = calculateStandardDeviation(currentXPositions);
        const currentStdDevY = calculateStandardDeviation(currentYPositions);
        
        // Calculate scale factors with safeguards against division by zero
        let scaleFactorX = 1;
        let scaleFactorY = 1;
        
        if (originalStdDevX > 0 && currentStdDevX > 0) {
          scaleFactorX = currentStdDevX / originalStdDevX;
        }
        
        if (originalStdDevY > 0 && currentStdDevY > 0) {
          scaleFactorY = currentStdDevY / originalStdDevY;
        }
        
        // Limit scale factors to reasonable ranges to prevent extreme scaling
        scaleFactorX = Math.max(0.5, Math.min(2.0, scaleFactorX));
        scaleFactorY = Math.max(0.5, Math.min(2.0, scaleFactorY));
        
        // Calculate the current center point based on the initial center plus average movement
        const centerX = ((detection.initialBox.xMin + detection.initialBox.xMax) / 2) + avgDeltaX;
        const centerY = ((detection.initialBox.yMin + detection.initialBox.yMax) / 2) + avgDeltaY;
        
        // Calculate original width and height
        const originalWidth = detection.initialBox.xMax - detection.initialBox.xMin;
        const originalHeight = detection.initialBox.yMax - detection.initialBox.yMin;
        
        // Calculate scaled width and height
        const scaledWidth = originalWidth * scaleFactorX;
        const scaledHeight = originalHeight * scaleFactorY;
        
        // Update the box position and size, centered around the updated center point
        detection.box.xMin = centerX - (scaledWidth / 2);
        detection.box.xMax = centerX + (scaledWidth / 2);
        detection.box.yMin = centerY - (scaledHeight / 2);
        detection.box.yMax = centerY + (scaledHeight / 2);
        
        // Update the center point as well
        detection.x = centerX;
        detection.y = centerY;
        
        // Optionally log scale changes (only occasionally to avoid console spam)
        if (Math.random() < 0.01) {
          console.log(`Detection "${detection.label}" scale: X=${scaleFactorX.toFixed(2)}, Y=${scaleFactorY.toFixed(2)}`);
        }
      }
    });
  };
  
  // Helper function to calculate standard deviation of an array of values
  const calculateStandardDeviation = (values) => {
    const n = values.length;
    if (n < 2) return 0; // Need at least 2 points to calculate std dev
    
    // Use Float64Array for better precision with numerical operations
    const typedValues = new Float64Array(values);
    
    // Use numerically stable one-pass algorithm (Welford's online algorithm)
    let mean = 0;
    let M2 = 0;
    
    for (let i = 0; i < n; i++) {
      const x = typedValues[i];
      const delta = x - mean;
      mean += delta / (i + 1);
      const delta2 = x - mean;
      M2 += delta * delta2;
    }
    
    // Calculate variance and standard deviation
    const variance = M2 / (n - 1); // Using n-1 for sample standard deviation
    return Math.sqrt(variance);
  };
  
  // Initialize canvas contexts
  useEffect(() => {
    if (canvasRef.current && cleanCanvasRef.current) {
      ctxRef.current = canvasRef.current.getContext('2d');
      cleanCtxRef.current = cleanCanvasRef.current.getContext('2d');
      
      // Set canvas sizes to match viewport
      const updateCanvasSize = () => {
        if (canvasRef.current && cleanCanvasRef.current) {
          canvasRef.current.width = window.innerWidth;
          canvasRef.current.height = window.innerHeight;
          cleanCanvasRef.current.width = window.innerWidth;
          cleanCanvasRef.current.height = window.innerHeight;
          
          // Initialize jsfeat tracking when canvas is ready
          initializeTracking(canvasRef.current.width, canvasRef.current.height);
        }
      };
      
      updateCanvasSize();
      window.addEventListener('resize', updateCanvasSize);
      
      return () => {
        window.removeEventListener('resize', updateCanvasSize);
      };
    }
  }, []);
  
  // Initialize jsfeat tracking variables
  const initializeTracking = (w, h) => {
    curpyrRef.current = new jsfeat.pyramid_t(3);
    prevpyrRef.current = new jsfeat.pyramid_t(3);
    curpyrRef.current.allocate(w, h, jsfeat.U8C1_t);
    prevpyrRef.current.allocate(w, h, jsfeat.U8C1_t);
    
    pointCountRef.current = 0;
    pointStatusRef.current = new Uint8Array(maxPoints);
    prevxyRef.current = new Float32Array(maxPoints * 2);
    curxyRef.current = new Float32Array(maxPoints * 2);
    origxyRef.current = new Float32Array(maxPoints * 2);
  };
  
  // Start animation loop when camera is active
  useEffect(() => {
    let animationFrameId = null;
    
    const startAnimationLoop = () => {
      if (isCameraActive) {
        // Cancel any existing animation frame first
        if (animationFrameIdRef.current) {
          cancelAnimationFrame(animationFrameIdRef.current);
        }
        
        // Start a new animation loop
        const animate = () => {
          drawVideoToCanvas();
          animationFrameIdRef.current = requestAnimationFrame(animate);
        };
        
        animate();
      }
    };
    
    startAnimationLoop();
    
    // Clean up function
    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
    };
  }, [isCameraActive]); // Only depend on isCameraActive
  
  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="camera-container relative">
      <video 
        ref={videoRef} 
        playsInline 
        autoPlay 
        className="hidden"
      ></video>
      <canvas 
        ref={canvasRef} 
        className="w-full h-full absolute top-0 left-0"
        onClick={handleCanvasClick}
      ></canvas>
      <canvas 
        ref={cleanCanvasRef} 
        className="hidden"
      ></canvas>
      
      <div className="controls-container absolute bottom-4 left-0 right-0 flex flex-col items-center">
        <div className="button-container flex space-x-4 mb-4">
          {isCameraActive && (
            <>
              <button 
                onClick={detectObjects}
                disabled={isLoading}
                className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600 disabled:opacity-50"
              >
                {isLoading ? (
                  <span className="material-icons rotating">sync</span>
                ) : (
                  <span className="material-icons">search</span>
                )}
              </button>
              <button 
                onClick={flipCamera}
                className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                <span className="material-icons">flip_camera_ios</span>
              </button>
              <button 
                onClick={clearDetections}
                className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                <span className="material-icons">clear</span>
              </button>
              <button 
                onClick={clearTrackingPoints}
                className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                <span className="material-icons">location_off</span>
              </button>
              <button 
                onClick={initializeTrackingPointGrid}
                className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                <span className="material-icons">grid_on</span>
              </button>
              <button 
                onClick={prunePoints}
                className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                <span className="material-icons">filter_list</span>
              </button>
              <button 
                onClick={() => setShowPointsDebug(prev => !prev)}
                className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                <span className="material-icons">{showPointsDebug ? 'visibility_off' : 'visibility'}</span>
              </button>
            </>
          )}
          {!isCameraActive && (
            <button 
              onClick={startCamera}
              className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600"
            >
              <span className="material-icons">videocam</span>
            </button>
          )}
        </div>
        
        <div className="input-container flex space-x-4 w-full max-w-md">
          <input 
            type="text" 
            value={searchPrompt}
            onChange={(e) => setSearchPrompt(e.target.value)}
            className="flex-1 p-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
            placeholder="What to detect"
          />
          <input 
            type="text" 
            value={labelPrompt}
            onChange={(e) => setLabelPrompt(e.target.value)}
            className="flex-1 p-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-black"
            placeholder="Label instruction"
          />
        </div>
      </div>
    </div>
  );
} 