import { CubeIcon, RefreshIcon } from './icons';

interface Props {
  /** show the landscape controls (hint + new artwork) */
  showActions: boolean;
  onNewArtwork: () => void;
}

export function Header({ showActions, onNewArtwork }: Props) {
  return (
    <header>
      <h1 className="pe"><i />synesthesia</h1>
      {showActions && (
        <div className="hdr-r pe">
          <div className="pill"><CubeIcon /><span>drag to rotate • scroll to zoom</span></div>
          <button className="btn soft" onClick={onNewArtwork}><RefreshIcon /> new artwork</button>
        </div>
      )}
    </header>
  );
}
