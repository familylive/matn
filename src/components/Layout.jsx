import Header from './Header.jsx'
import BottomNav from './BottomNav.jsx'

export default function Layout({ children }) {
  return (
    <div className="w-full max-w-sm md:max-w-4xl lg:max-w-6xl mx-auto flex flex-col h-[100dvh] bg-gray-50 md:shadow-[0_0_60px_rgba(0,0,0,0.06)]">
      <Header />
      <main className="flex-grow overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
