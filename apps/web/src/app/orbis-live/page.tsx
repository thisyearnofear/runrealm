import type { Metadata } from 'next';
import OrbisLiveClient from './OrbisLiveClient';

export const metadata: Metadata = {
  title: 'Orbis Live — Sunprint Atlas Challenge Slice',
  description:
    'A wallet-free RunRealm demo where runs, ghost rivals, and territory state steer Visko Orbis video in real time.',
};

export default function OrbisLivePage() {
  return <OrbisLiveClient />;
}
