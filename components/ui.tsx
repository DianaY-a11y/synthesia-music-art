import React, { useRef } from 'react';

export const Button: React.FC<{
  onClick?: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  className?: string;
  disabled?: boolean;
}> = ({ onClick, children, variant = 'primary', className = '', disabled = false }) => {
  const baseStyle = "px-6 py-3 rounded-full font-semibold transition-all duration-300 transform active:scale-95 shadow-lg flex items-center justify-center gap-2";
  const variants = {
    primary: "bg-white text-black hover:bg-gray-200 disabled:bg-gray-600 disabled:text-gray-400",
    secondary: "bg-gray-800 text-white border border-gray-700 hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600",
    danger: "bg-red-500 text-white hover:bg-red-600"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

export const Slider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  formatValue?: (val: number) => string;
}> = ({ label, value, min, max, step = 1, onChange, formatValue }) => {
  return (
    <div className="flex flex-col gap-1 min-w-[150px]">
      <div className="flex justify-between text-xs uppercase tracking-wider text-gray-500 font-semibold">
        <span>{label}</span>
        <span className="text-white font-mono">{formatValue ? formatValue(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-white hover:accent-gray-300"
      />
    </div>
  );
};

export const Select: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (val: string) => void;
}> = ({ label, value, options, onChange }) => {
  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <label className="text-xs uppercase tracking-wider text-gray-500 font-semibold">{label}</label>
      <select 
        value={value} 
        onChange={(e) => onChange(e.target.value)}
        className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 border border-gray-700 focus:outline-none focus:border-white appearance-none cursor-pointer hover:bg-gray-700"
      >
        {options.map(opt => (
          <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
        ))}
      </select>
    </div>
  );
};

export const FileUpload: React.FC<{ onFileSelect: (file: File) => void }> = ({ onFileSelect }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
  };

  return (
    <div
      className="border-2 border-dashed border-gray-600 rounded-2xl p-12 text-center hover:border-white transition-colors cursor-pointer bg-gray-900/50 backdrop-blur-sm"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        type="file"
        ref={inputRef}
        className="hidden"
        accept="image/*"
        onChange={handleChange}
      />
      <h3 className="text-xl font-bold text-white mb-2">Upload Artwork</h3>
      <p className="text-sm text-gray-500">Drag & drop or click to browse</p>
    </div>
  );
};

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`bg-black/40 backdrop-blur-md border border-white/10 p-6 rounded-2xl shadow-xl ${className}`}>
    {children}
  </div>
);