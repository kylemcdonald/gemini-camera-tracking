'use client';

import { useState } from 'react';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      setResponse(data.text || '');
    } catch (error) {
      console.error('Error:', error);
      setResponse('An error occurred while generating the response.');
    }
    setIsLoading(false);
  };

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto grid grid-cols-2 gap-8">
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Input</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full h-[500px] p-4 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your prompt here..."
            />
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? 'Generating...' : 'Generate'}
            </button>
          </form>
        </div>
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Output</h2>
          <div className="w-full h-[500px] p-4 rounded-lg border border-gray-300 bg-gray-50 overflow-auto whitespace-pre-wrap">
            {response}
          </div>
        </div>
      </div>
    </main>
  );
}
