import React from 'react';

export default function TestForm() {
  return (
    <div className="min-h-screen bg-blue-500 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl">
        <h1>Test Form</h1>
        <form>
          <input
            type="text"
            placeholder="Type here..."
            className="border-2 border-gray-300 p-2 rounded"
          />
          <input
            type="tel"
            placeholder="Phone..."
            className="border-2 border-gray-300 p-2 rounded mt-2"
          />
        </form>
      </div>
    </div>
  );
}