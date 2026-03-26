import { TvRatesBoard } from '@/components/tv-rates-board';
import { getRatesSnapshot } from '@/lib/sources';

export default async function Home() {
  const snapshot = await getRatesSnapshot();

  return (
    <main className='flex min-h-screen w-full flex-1 items-stretch justify-center px-4 py-4 lg:px-6 lg:py-6'>
      <TvRatesBoard initialSnapshot={snapshot} />
    </main>
  );
}
