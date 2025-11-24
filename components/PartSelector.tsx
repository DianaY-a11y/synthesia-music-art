import React, { useState, useEffect } from 'react';

const PARTS = ['melody', 'bass', 'harmony', 'percussion'];

interface PartSelectorProps {
  selectedParts: string[];
  onChange: (selectedParts: string[]) => void;
}

const PartSelector: React.FC<PartSelectorProps> = ({ selectedParts, onChange }) => {
  
  const togglePart = (part: string) => {
    const newSelectedParts = selectedParts.includes(part)
      ? selectedParts.filter(p => p !== part)
      : [...selectedParts, part];
    onChange(newSelectedParts);
  };

  return (
    <div className="flex gap-2 mb-2">
      <span className="text-xs uppercase tracking-wider text-gray-500 font-semibold self-center">Show Parts:</span>
      {PARTS.map(part => (
        <button
          key={part}
          onClick={() => togglePart(part)}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            selectedParts.includes(part)
              ? 'bg-cyan-400/20 border-cyan-400 text-cyan-300'
              : 'bg-gray-800/50 border-gray-700 text-gray-400 hover:bg-gray-700'
          }`}
        >
          {part.charAt(0).toUpperCase() + part.slice(1)}
        </button>
      ))}
    </div>
  );
};

export default PartSelector;