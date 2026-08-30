import { useEffect, useState } from "react";
import { AlertCircle, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { updateDealerRequest } from "../api/dealer.api";
import { updatePasswordRequest } from "../api/auth.api";
import Button from "../components/shared/Button";

export default function SettingsPage() {
  const { user, updateSession } = useAuth();

  // Profile State
  const [businessName, setBusinessName] = useState(user?.businessName || "");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMessage, setProfileMessage] = useState(null);

  // Items State
  const [itemTypes, setItemTypes] = useState(user?.config?.itemTypes || []);

  useEffect(() => {
    setBusinessName(user?.businessName || "");
    setItemTypes(user?.config?.itemTypes || []);
  }, [user?.businessName, user?.config?.itemTypes]);
  const [newItemName, setNewItemName] = useState("");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsMessage, setItemsMessage] = useState(null);

  // Security State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityMessage, setSecurityMessage] = useState(null);

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMessage(null);
    try {
      const data = await updateDealerRequest({ businessName });
      updateSession({ dealer: data });
      setProfileMessage({ type: "success", text: "Profile updated successfully." });
    } catch (err) {
      setProfileMessage({
        type: "error",
        text: err.response?.data?.error || "Failed to update profile.",
      });
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAddItem = async (e) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    setItemsLoading(true);
    setItemsMessage(null);

    const updatedItems = [...itemTypes, newItemName.trim()];
    try {
      const data = await updateDealerRequest({ itemTypes: updatedItems });
      setItemTypes(data.config.itemTypes || []);
      updateSession({ dealer: data });
      setNewItemName("");
      setItemsMessage({ type: "success", text: "Item added successfully." });
    } catch (err) {
      setItemsMessage({ type: "error", text: err.response?.data?.error || "Failed to add item." });
    } finally {
      setItemsLoading(false);
    }
  };

  const handleRemoveItem = async (indexToRemove) => {
    setItemsLoading(true);
    setItemsMessage(null);

    const updatedItems = itemTypes.filter((_, idx) => idx !== indexToRemove);
    try {
      const data = await updateDealerRequest({ itemTypes: updatedItems });
      setItemTypes(data.config.itemTypes || []);
      updateSession({ dealer: data });
      setItemsMessage({ type: "success", text: "Item removed successfully." });
    } catch (err) {
      setItemsMessage({
        type: "error",
        text: err.response?.data?.error || "Failed to remove item.",
      });
    } finally {
      setItemsLoading(false);
    }
  };

  const handleSecuritySubmit = async (e) => {
    e.preventDefault();
    setSecurityLoading(true);
    setSecurityMessage(null);
    try {
      await updatePasswordRequest({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setSecurityMessage({ type: "success", text: "Password changed successfully." });
    } catch (err) {
      setSecurityMessage({
        type: "error",
        text: err.response?.data?.error || "Failed to change password.",
      });
    } finally {
      setSecurityLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl pb-12">
      <div>
        <p className="mono-label">Configuration</p>
        <h2 className="mt-2 text-2xl font-bold">Settings.</h2>
        <p className="mt-1 text-sm text-slate-500">Manage your business profile and preferences.</p>
      </div>

      {/* Business Profile */}
      <div className="panel p-6">
        <h3 className="font-bold text-lg mb-4">Business Profile</h3>
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Business Name</label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-fuelo-ink focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1 text-slate-500">
              Vertical Type (Read-only)
            </label>
            <input
              type="text"
              value={user?.verticalType || ""}
              disabled
              className="w-full rounded-[8px] border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500 uppercase tracking-wide cursor-not-allowed"
            />
          </div>
          {profileMessage && (
            <div
              className={`flex items-center gap-2 text-sm font-medium ${profileMessage.type === "error" ? "text-red-600" : "text-emerald-600"}`}
            >
              {profileMessage.type === "error" ? (
                <AlertCircle size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {profileMessage.text}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={profileLoading}>
              Save Changes
            </Button>
          </div>
        </form>
      </div>

      {/* Item Types Config */}
      <div className="panel p-6">
        <div className="mb-4">
          <h3 className="font-bold text-lg">Item Types</h3>
          <p className="text-sm text-slate-500">
            Configure the inventory items available for transactions in this workspace.
          </p>
        </div>

        <div className="space-y-3 mb-6">
          {itemTypes.length === 0 ? (
            <div className="text-sm text-slate-400 italic py-2">No item types configured.</div>
          ) : (
            itemTypes.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-[8px] border border-slate-200 p-3 bg-slate-50"
              >
                <span className="font-medium text-sm">{item}</span>
                <button
                  onClick={() => handleRemoveItem(idx)}
                  disabled={itemsLoading}
                  className="text-slate-400 hover:text-red-500 transition"
                  title="Remove item"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleAddItem} className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-semibold mb-1">Add New Item</label>
            <input
              type="text"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="e.g. Diesel, Grade A Timber"
              className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-fuelo-ink focus:outline-none"
            />
          </div>
          <Button
            type="submit"
            disabled={itemsLoading || !newItemName.trim()}
            className="flex items-center gap-2"
          >
            <Plus size={16} /> Add
          </Button>
        </form>
        {itemsMessage && (
          <div
            className={`mt-3 flex items-center gap-2 text-sm font-medium ${itemsMessage.type === "error" ? "text-red-600" : "text-emerald-600"}`}
          >
            {itemsMessage.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
            {itemsMessage.text}
          </div>
        )}
      </div>

      {/* Security */}
      <div className="panel p-6 border-red-100">
        <h3 className="font-bold text-lg mb-4 text-red-600">Security</h3>
        <form onSubmit={handleSecuritySubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold mb-1">Current Password</label>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1">New Password</label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
            />
          </div>
          {securityMessage && (
            <div
              className={`flex items-center gap-2 text-sm font-medium ${securityMessage.type === "error" ? "text-red-600" : "text-emerald-600"}`}
            >
              {securityMessage.type === "error" ? (
                <AlertCircle size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              {securityMessage.text}
            </div>
          )}
          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              disabled={securityLoading}
              className="!bg-red-600 hover:!bg-red-700"
            >
              Change Password
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
