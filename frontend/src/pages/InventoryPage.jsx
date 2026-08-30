import { useState, useEffect } from "react";
import { AlertCircle, CheckCircle2, Package, Plus, Trash2, Pencil, X, Save } from "lucide-react";
import {
  fetchInventory,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
} from "../api/inventory.api";
import Button from "../components/shared/Button";
import SkeletonCard from "../components/shared/SkeletonCard";
import { useAuth } from "../context/AuthContext";

export default function InventoryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // Add-new form
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({
    itemType: "",
    currentStock: "",
    unit: "litres",
    pricePerUnit: "",
  });
  const [addLoading, setAddLoading] = useState(false);

  // Inline edit
  const [editIdx, setEditIdx] = useState(null);
  const [editValues, setEditValues] = useState({ currentStock: "", pricePerUnit: "" });
  const [editLoading, setEditLoading] = useState(false);

  useEffect(() => {
    loadInventory();
  }, [user?.workspaceId]);

  async function loadInventory() {
    setLoading(true);
    try {
      const data = await fetchInventory();
      setItems(data);
    } catch (err) {
      setMessage({ type: "error", text: "Failed to load inventory." });
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAddLoading(true);
    setMessage(null);
    try {
      const created = await createInventoryItem({
        itemType: newItem.itemType.trim(),
        currentStock: Number(newItem.currentStock) || 0,
        unit: newItem.unit,
        pricePerUnit: Number(newItem.pricePerUnit) || 0,
      });
      setItems((prev) => [...prev, created]);
      setNewItem({ itemType: "", currentStock: "", unit: "litres", pricePerUnit: "" });
      setShowAdd(false);
      setMessage({ type: "success", text: `"${created.itemType}" added.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Failed to add item.",
      });
    } finally {
      setAddLoading(false);
    }
  }

  function startEdit(idx) {
    setEditIdx(idx);
    setEditValues({
      currentStock: items[idx].currentStock,
      pricePerUnit: items[idx].pricePerUnit,
    });
  }

  async function handleSaveEdit() {
    setEditLoading(true);
    setMessage(null);
    const item = items[editIdx];
    try {
      const updated = await updateInventoryItem(item.itemType, {
        currentStock: Number(editValues.currentStock),
        pricePerUnit: Number(editValues.pricePerUnit),
      });
      setItems((prev) => prev.map((it, i) => (i === editIdx ? updated : it)));
      setEditIdx(null);
      setMessage({ type: "success", text: `"${item.itemType}" updated.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Failed to update.",
      });
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDelete(idx) {
    const item = items[idx];
    if (!window.confirm(`Delete "${item.itemType}" from inventory?`)) return;
    setMessage(null);
    try {
      await deleteInventoryItem(item.itemType);
      setItems((prev) => prev.filter((_, i) => i !== idx));
      setMessage({ type: "success", text: `"${item.itemType}" removed.` });
    } catch (err) {
      setMessage({
        type: "error",
        text: err.response?.data?.error || "Failed to delete.",
      });
    }
  }

  function formatDate(d) {
    if (!d) return "—";
    return new Date(d).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 max-w-4xl">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-7 max-w-4xl pb-12">
      <div>
        <p className="mono-label">Stock &amp; pricing</p>
        <h2 className="mt-2 text-2xl font-bold">Inventory.</h2>
        <p className="mt-1 text-sm text-slate-500">
          Track stock levels and prices for your workspace items.
        </p>
      </div>

      {message && (
        <div
          className={`flex items-center gap-2 rounded-[8px] p-4 text-sm font-medium ${
            message.type === "error" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
          }`}
        >
          {message.type === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {message.text}
        </div>
      )}

      {/* Inventory table */}
      {items.length === 0 && !showAdd ? (
        <div className="panel p-10 text-center">
          <Package size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-500">No inventory items yet</p>
          <p className="text-sm text-slate-400 mt-1">
            Add items to start tracking stock and prices.
          </p>
          <Button onClick={() => setShowAdd(true)} className="mt-5">
            <Plus size={16} className="mr-1" /> Add First Item
          </Button>
        </div>
      ) : (
        <>
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left">
                  <th className="px-5 py-3 mono-label">Item</th>
                  <th className="px-5 py-3 mono-label text-right">Stock</th>
                  <th className="px-5 py-3 mono-label text-right">Price / Unit</th>
                  <th className="px-5 py-3 mono-label">Last Updated</th>
                  <th className="px-5 py-3 mono-label text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr key={item._id} className="border-b border-slate-50 last:border-0">
                    {editIdx === idx ? (
                      <>
                        <td className="px-5 py-3 font-semibold">{item.itemType}</td>
                        <td className="px-5 py-3 text-right">
                          <input
                            type="number"
                            value={editValues.currentStock}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                currentStock: e.target.value,
                              }))
                            }
                            className="w-24 rounded-[6px] border border-slate-200 px-2 py-1 text-right text-sm focus:border-fuelo-ink focus:outline-none"
                          />
                          <span className="ml-1 text-slate-400 text-xs">{item.unit}</span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <span className="text-slate-400 mr-1">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            value={editValues.pricePerUnit}
                            onChange={(e) =>
                              setEditValues((v) => ({
                                ...v,
                                pricePerUnit: e.target.value,
                              }))
                            }
                            className="w-24 rounded-[6px] border border-slate-200 px-2 py-1 text-right text-sm focus:border-fuelo-ink focus:outline-none"
                          />
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs">
                          {formatDate(item.lastPriceUpdate)}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={handleSaveEdit}
                              disabled={editLoading}
                              className="grid h-8 w-8 place-items-center rounded-[6px] bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition"
                              title="Save"
                            >
                              <Save size={14} />
                            </button>
                            <button
                              onClick={() => setEditIdx(null)}
                              className="grid h-8 w-8 place-items-center rounded-[6px] bg-slate-100 text-slate-500 hover:bg-slate-200 transition"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-5 py-3">
                          <span className="font-semibold">{item.itemType}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          {item.currentStock.toLocaleString("en-IN")}
                          <span className="ml-1 text-slate-400 text-xs">{item.unit}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono">
                          ₹{item.pricePerUnit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          <span className="ml-1 text-slate-400 text-xs">/{item.unit}</span>
                        </td>
                        <td className="px-5 py-3 text-slate-400 text-xs">
                          {formatDate(item.lastPriceUpdate)}
                          {item.priceSource === "auto" && (
                            <span className="ml-1 text-blue-500 font-semibold uppercase">auto</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => startEdit(idx)}
                              className="grid h-8 w-8 place-items-center rounded-[6px] text-slate-400 hover:bg-slate-100 hover:text-fuelo-ink transition"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => handleDelete(idx)}
                              className="grid h-8 w-8 place-items-center rounded-[6px] text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!showAdd && (
            <Button onClick={() => setShowAdd(true)} className="flex items-center gap-2">
              <Plus size={16} /> Add Item
            </Button>
          )}
        </>
      )}

      {/* Add new item form */}
      {showAdd && (
        <div className="panel p-6">
          <h3 className="font-bold mb-4">Add Inventory Item</h3>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={newItem.itemType}
                  onChange={(e) => setNewItem((n) => ({ ...n, itemType: e.target.value }))}
                  placeholder="e.g. Petrol, Diesel, Teak"
                  className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-fuelo-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Unit</label>
                <select
                  value={newItem.unit}
                  onChange={(e) => setNewItem((n) => ({ ...n, unit: e.target.value }))}
                  className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-fuelo-ink focus:outline-none bg-white"
                >
                  <option value="litres">Litres</option>
                  <option value="kg">Kilograms</option>
                  <option value="cubic ft">Cubic Feet</option>
                  <option value="bags">Bags</option>
                  <option value="units">Units</option>
                  <option value="tonnes">Tonnes</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-semibold mb-1">Current Stock</label>
                <input
                  type="number"
                  value={newItem.currentStock}
                  onChange={(e) => setNewItem((n) => ({ ...n, currentStock: e.target.value }))}
                  placeholder="e.g. 2000"
                  className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-fuelo-ink focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Price per Unit (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newItem.pricePerUnit}
                  onChange={(e) => setNewItem((n) => ({ ...n, pricePerUnit: e.target.value }))}
                  placeholder="e.g. 106.31"
                  className="w-full rounded-[8px] border border-slate-200 px-3 py-2 text-sm focus:border-fuelo-ink focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={addLoading}>
                Add to Inventory
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
