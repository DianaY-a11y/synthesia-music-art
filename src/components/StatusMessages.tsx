export function Creating() {
  return (
    <div className="analyzing pe">
      <p>creating...</p>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="error pe">
      <p>Failed to analyze artwork. Please try another file.</p>
      <button className="btn solid" onClick={onRetry}>Try Again</button>
    </div>
  );
}
