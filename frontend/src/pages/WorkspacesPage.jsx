import { useState } from "react";
import { Plus, Trash2, Building, Check, AlertCircle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { switchWorkspaceRequest, createWorkspaceRequest, deleteWorkspaceRequest } from "../api/auth.api";
import Button from "../components/shared/Button";

export default function WorkspacesPage() {
  const { user, workspaces, updateSession, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState({ businessName: "", verticalType: "fuel" });

  const handleSwitch = async (workspaceId) => {
    if (workspaceId === user.workspaceId) return;
    setLoading(true);
    try {
      const data = await switchWorkspaceRequest(workspaceId);
      updateSession(data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to switch workspace");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const data = await createWorkspaceRequest(newWorkspace);
      // Automatically switch to the new workspace, or just update the list.
      // Let's just update the list for now by triggering a re-login or manual fetch, 
      // but since we don't have a fetchWorkspaces endpoint, we'll append to Context.
      const newWorkspaces = [...workspaces, data];
      updateSession({ workspaces: newWorkspaces });
      setShowAdd(false);
      setNewWorkspace({ businessName: "", verticalType: "fuel" });
    } catch (err) {
      setError(err.response?.data?.error || "Failed to create workspace");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (workspaceId) => {
    if (!window.confirm("Are you sure you want to delete this workspace? This cannot be undone.")) return;
    
    setLoading(true);
    setError(null);
    try {
      await deleteWorkspaceRequest(workspaceId);
      const newWorkspaces = workspaces.filter((w) => w.workspaceId !== workspaceId);
      updateSession({ workspaces: newWorkspaces });
    } catch (err) {
      setError(err.response?.data?.error || "Failed to delete workspace");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <p className="mono-label">Account settings</p>
        <h2 className="mt-2 text-2xl font-bold">Workspaces.</h2>
        <p className="mt-1 text-sm text-slate-500">Manage your business profiles.</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-[8px] bg-red-50 p-4 text-sm font-medium text-red-600">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div className="panel divide-y divide-slate-100">
        {workspaces.map((ws) => {
          const isActive = ws.workspaceId === user.workspaceId;
          return (
            <div key={ws.workspaceId} className="flex items-center justify-between p-5">
              <div className="flex items-center gap-4">
                <div className={`grid h-10 w-10 place-items-center rounded-[8px] ${isActive ? 'bg-fuelo-ink text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {isActive ? <Check size={18} /> : <Building size={18} />}
                </div>
                <div>
                  <h3 className="font-bold">{ws.businessName}</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wide">{ws.verticalType}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {!isActive && (
                  <>
                    <Button variant="secondary" onClick={() => handleSwitch(ws.workspaceId)} disabled={loading || authLoading}>
                      Switch
                    </Button>
                    <button 
                      onClick={() => handleDelete(ws.workspaceId)}
                      disabled={loading}
                      className="grid h-9 w-9 place-items-center rounded-[8px] text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
                    >
                      <Trash2 size={16} />
                    </button>
                  </>
                )}
                {isActive && (
                  <span className="text-xs font-semibold text-fuelo-coral bg-fuelo-coral/10 px-3 py-1.5 rounded-full">
                    Active
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!showAdd ? (
        <Button onClick={() => setShowAdd(true)} className="w-full flex items-center justify-center gap-2">
          <Plus size={16} /> Add New Workspace
        </Button>
      ) : (
        <div className="panel p-5">
          <h3 className="font-bold mb-4">Create New Workspace</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold mb-1">Business Name</label>
              <input
                type="text"
                required
                value={newWorkspace.businessName}
                onChange={(e) => setNewWorkspace({ ...newWorkspace, businessName: e.target.value })}
                className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-fuelo-ink focus:outline-none"
                placeholder="e.g. Acme Corp"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold mb-1">Vertical Type</label>
              <select
                value={newWorkspace.verticalType}
                onChange={(e) => setNewWorkspace({ ...newWorkspace, verticalType: e.target.value })}
                className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-fuelo-ink focus:outline-none bg-white"
              >
                <option value="fuel">Fuel</option>
                <option value="timber">Timber</option>
                <option value="construction">Construction</option>
                <option value="kirana">Kirana</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button type="submit" disabled={loading}>Create Workspace</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
