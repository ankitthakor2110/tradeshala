import Image from "next/image";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center">
      <h1 className="text-5xl font-bold text-green-400 mb-4">TradeShala 📈</h1>
      <p className="text-xl text-gray-400">Your virtual paper trading playground</p>
      <div className="mt-8 flex gap-4">
        <button className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg font-semibold">
          Start Trading
        </button>
        <button className="border border-green-500 text-green-400 hover:bg-green-500 hover:text-white px-6 py-3 rounded-lg font-semibold">
          Learn More
        </button>
      </div>
    </main>
  );
}