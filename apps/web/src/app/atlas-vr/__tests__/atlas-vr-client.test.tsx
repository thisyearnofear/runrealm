import '@testing-library/jest-dom';
import { serializeAtlasBackup } from '@runrealm/shared-core/utils/atlas-backup';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createDemoAtlas } from '../../../shell/atlas-vr/demo-atlas';
import AtlasVrClient from '../atlas-vr-client';

function setNavigatorXr(value: unknown) {
  Object.defineProperty(window.navigator, 'xr', {
    value,
    configurable: true,
    writable: true,
  });
}

function pickFile(input: HTMLInputElement, name: string, text: string) {
  const file = new File([text], name, { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  window.localStorage.clear();
  setNavigatorXr(undefined);
  jest
    .spyOn(HTMLCanvasElement.prototype, 'getContext')
    .mockReturnValue(null as unknown as RenderingContext);
});

afterEach(() => {
  jest.restoreAllMocks();
  setNavigatorXr(undefined);
});

describe('AtlasVrClient', () => {
  it('shows the demo atlas labelled as not real data', () => {
    render(<AtlasVrClient />);
    expect(screen.getByText('Demo atlas — not your data')).toBeInTheDocument();
    expect(screen.getByText(/Neighbourhood 1 of 2/)).toBeInTheDocument();
  });

  it('hides Enter VR and explains the fallback when navigator.xr is absent', async () => {
    render(<AtlasVrClient />);
    expect(screen.queryByRole('button', { name: 'Enter VR' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText(/no immersive VR — the flat view above is the same scene/i)
      ).toBeInTheDocument();
    });
  });

  it('hides Enter VR when immersive-vr is unsupported', async () => {
    setNavigatorXr({ isSessionSupported: async () => false });
    render(<AtlasVrClient />);
    await waitFor(() => {
      expect(
        screen.getByText(/no immersive VR — the flat view above is the same scene/i)
      ).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'Enter VR' })).not.toBeInTheDocument();
  });

  it('shows Enter VR when immersive-vr is supported', async () => {
    setNavigatorXr({ isSessionSupported: async () => true });
    render(<AtlasVrClient />);
    expect(await screen.findByRole('button', { name: 'Enter VR' })).toBeInTheDocument();
  });

  it('loads a serialized atlas backup through the file input', async () => {
    render(<AtlasVrClient />);
    const backupText = serializeAtlasBackup(createDemoAtlas(), 1_757_000_000_000);
    const input = screen.getByLabelText('Load atlas backup file') as HTMLInputElement;
    pickFile(input, 'atlas.json', backupText);
    await waitFor(() => {
      expect(screen.getByText(/Neighbourhood 1 of 2/)).toBeInTheDocument();
      expect(screen.getByText(/Restored 2 neighbourhood pages/)).toBeInTheDocument();
      expect(screen.getByText(/Atlas from backup file/)).toBeInTheDocument();
    });
  });

  it('rejects an invalid backup file with a typed error', async () => {
    render(<AtlasVrClient />);
    const input = screen.getByLabelText('Load atlas backup file') as HTMLInputElement;
    pickFile(input, 'bad.json', '{"format":"nope"}');
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('not a valid RunRealm atlas backup');
    });
  });

  it('navigates pages with the prev/next buttons', async () => {
    render(<AtlasVrClient />);
    fireEvent.click(screen.getByRole('button', { name: 'Next →' }));
    expect(await screen.findByText(/Neighbourhood 2 of 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '← Prev' }));
    expect(await screen.findByText(/Neighbourhood 1 of 2/)).toBeInTheDocument();
  });

  it('reports when no device atlas exists', () => {
    render(<AtlasVrClient />);
    fireEvent.click(screen.getByRole('button', { name: 'This device' }));
    expect(screen.getByRole('alert')).toHaveTextContent('No atlas is stored on this device');
  });

  it('renders the demo spine controls with honest labels', () => {
    render(<AtlasVrClient />);
    expect(screen.getByRole('button', { name: 'Develop newest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay last outing' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: /Time-scrub the atlas/i })).toBeInTheDocument();
    expect(screen.getByText('Demo atlas — not your data')).toBeInTheDocument();
    expect(screen.getByText(/Atlas as of latest/)).toBeInTheDocument();
  });

  it('marks newest blocks developed instantly under reduced motion', () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    try {
      render(<AtlasVrClient />);
      expect(screen.queryByText('Developing newest blocks…')).not.toBeInTheDocument();
      expect(screen.getByText('Newest blocks developed')).toBeInTheDocument();
    } finally {
      window.matchMedia = original;
    }
  });

  it('labels the time scrub when dragged back to an earlier visit date', () => {
    render(<AtlasVrClient />);
    const slider = screen.getByRole('slider', { name: /Time-scrub the atlas/i });
    fireEvent.change(slider, { target: { value: '0' } });
    expect(screen.queryByText('Atlas as of latest')).not.toBeInTheDocument();
    expect(screen.getByText(/Atlas as of/)).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '3' } });
    expect(screen.getByText('Atlas as of latest')).toBeInTheDocument();
  });
});
