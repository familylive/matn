import Header from './Header.jsx'
import BottomNav from './BottomNav.jsx'

export default function Layout({ children }) {
  return (
    <div className="max-w-sm mx-auto flex flex-col h-screen bg-gray-50">
      <Header />
      <main className="flex-grow overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
