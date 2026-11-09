import type { Metadata } from 'next';
import AtlasVrClient from './atlas-vr-client';

export const metadata: Metadata = {
  title: 'Atlas VR — RunRealm',
  description:
    'A WebXR prototype that renders your RunRealm neighbourhood atlas as a physical map table in immersive VR, with a flat fallback view.',
};

export default function AtlasVrPage() {
  return <AtlasVrClient />;
}
