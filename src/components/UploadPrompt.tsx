import { useRef, useState } from 'react';

interface Props {
  onFile: (file: File) => void;
  /** called inside the click/drop itself, so the browser allows audio to start */
  onGesture: () => void;
}

export function UploadPrompt({ onFile, onGesture }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className={`upload pe ${dragging ? 'drag' : ''}`}
      onClick={() => { onGesture(); input.current?.click(); }}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setDragging(false);
        onGesture();
        const file = e.dataTransfer.files?.[0];
        if (file) onFile(file);
      }}
    >
      <span className="dot" id="up-dot" />
      <input
        ref={input}
        type="file"
        accept="image/*"
        onChange={e => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ''; }}
      />
      <h3>Upload Artwork</h3>
      <p>Drag &amp; drop or click to browse</p>
    </div>
  );
}
