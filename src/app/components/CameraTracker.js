'use client';

import { useEffect, useRef, useState } from 'react';

export default function CameraTracker() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState('user');
  const [points, setPoints] = useState([]);
  const [searchPrompt, setSearchPrompt] = useState('parts of the face');
  const [labelPrompt, setLabelPrompt] = useState('a representative emoji');
  const [isLoading, setIsLoading] = useState(false);
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const cleanCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const ctxRef = useRef(null);
  const cleanCtxRef = useRef(null);
  
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
  
  // Clear points
  const clearPoints = () => {
    setPoints([]);
  };
  
  // Add point on canvas click
  const addPoint = (e) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setPoints(prev => [...prev, { x, y }]);
  };
  
  // Handle canvas click
  const handleCanvasClick = (e) => {
    addPoint(e);
  };
  
  // Handle canvas touch
  const handleCanvasTouch = (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent('click', {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    addPoint(mouseEvent);
  };
  
  // Detect objects using the proxy endpoint
  const detectObjects = async () => {
    if (!cleanCanvasRef.current) return;
    
    try {
      setIsLoading(true);
      
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
      
      // Add bounding boxes and labels gradually with a delay
      detections.forEach((detection, index) => {
        setTimeout(() => {
          const [yMin, xMin, yMax, xMax] = detection.box_2d;
          // Calculate center point for text placement
          const centerX = ((xMin + xMax) / 2 / 1000) * canvasRef.current.width;
          const centerY = ((yMin + yMax) / 2 / 1000) * canvasRef.current.height;
          
          setPoints(prev => [...prev, {
            x: centerX,
            y: centerY,
            label: detection.label,
            box: {
              xMin: (xMin / 1000) * canvasRef.current.width,
              yMin: (yMin / 1000) * canvasRef.current.height,
              xMax: (xMax / 1000) * canvasRef.current.width,
              yMax: (yMax / 1000) * canvasRef.current.height
            }
          }]);
        }, index * 1000);
      });
    } catch (error) {
      console.error('Error calling API:', error);
    } finally {
      setIsLoading(false);
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
    
    if (facingMode === 'user') {
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
    
    // Draw points with labels only on the visible canvas
    ctx.font = '32px Arial';
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    points.forEach(point => {
      if (point.label) {
        ctx.fillText(point.label, point.x, point.y);
      }
    });
    
    // Continue animation loop
    requestAnimationFrame(drawVideoToCanvas);
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
        }
      };
      
      updateCanvasSize();
      window.addEventListener('resize', updateCanvasSize);
      
      return () => {
        window.removeEventListener('resize', updateCanvasSize);
      };
    }
  }, []);
  
  // Start animation loop when camera is active
  useEffect(() => {
    if (isCameraActive) {
      drawVideoToCanvas();
    }
  }, [isCameraActive, points, facingMode]);
  
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
        onTouchStart={handleCanvasTouch}
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
                onClick={clearPoints}
                className="w-14 h-14 flex items-center justify-center bg-blue-500 text-white rounded-full hover:bg-blue-600"
              >
                <span className="material-icons">clear</span>
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