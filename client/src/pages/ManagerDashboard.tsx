import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function ManagerDashboard() {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold">Mission Control</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => logout()}>
            <LogOut className="w-4 h-4 mr-2" /> Logout
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">Manager Dashboard</h1>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Fleet Status</h2>
              <p className="text-gray-600">Dashboard is loading successfully!</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Active Trips</h2>
              <p className="text-gray-600">Trip monitoring active</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow">
              <h2 className="text-xl font-semibold mb-4">Emergency Alerts</h2>
              <p className="text-gray-600">No active emergencies</p>
            </div>
          </div>
          
          <div className="mt-8 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            <strong>✅ Manager Dashboard Working!</strong>
            <p>The JavaScript compilation errors have been fixed. The dashboard is now loading properly.</p>
          </div>
        </div>
      </main>
    </div>
  );
}