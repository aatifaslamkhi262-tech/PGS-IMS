"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface UserItem {
  _id: string;
  name?: string;
  username: string;
  role: string;
  assignedLocation?: { _id: string; name: string; code: string; type: string };
  active: boolean;
  createdAt: string;
}

interface LocationOption {
  _id: string;
  name: string;
  code: string;
  type: string;
}

export default function UsersManagementPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  // Create User Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("Salesman");
  const [assignedLocation, setAssignedLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  const fetchUsers = async () => {
    try {
      setLoading(true);
      setError("");
      let url = "/api/users";
      if (search.trim()) url += `?search=${encodeURIComponent(search.trim())}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      } else {
        setError(data.error || "Failed to load users.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const fetchLocations = async () => {
    try {
      const res = await fetch("/api/locations");
      const data = await res.json();
      if (data.success) setLocations(data.data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchLocations();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError("");

    if (!username.trim() || !password.trim()) {
      setModalError("Username and password are required.");
      return;
    }

    try {
      setSubmitting(true);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || username.trim(),
          username: username.trim(),
          password: password.trim(),
          role,
          assignedLocation: assignedLocation || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        // Reset form
        setName("");
        setUsername("");
        setPassword("");
        setRole("Salesman");
        setAssignedLocation("");
        fetchUsers();
      } else {
        setModalError(data.error || "Failed to create user account.");
      }
    } catch (err: any) {
      setModalError(err.message || "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (userId: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        fetchUsers();
      } else {
        alert("Error: " + data.error);
      }
    } catch (e: any) {
      alert("Error: " + e.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900 border border-slate-800 p-5 rounded-2xl shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 tracking-tight">
              User Accounts & Staff Management
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Admin & Warehouse Manager control panel to create and assign Salesmen, Branch staff & Managers
            </p>
          </div>

          <div className="flex gap-2">
            <Link
              href="/"
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700"
            >
              ← Dashboard
            </Link>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-md shadow-indigo-900/30 transition"
            >
              + Create Staff / Salesman Account
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/80 border border-rose-800 text-rose-300 text-sm">
            ❌ {error}
          </div>
        )}

        {/* User Search Bar */}
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 flex justify-between items-center">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchUsers();
            }}
            className="flex gap-2 w-full sm:w-96"
          >
            <input
              type="text"
              placeholder="Search by name or username..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-semibold rounded-lg border border-slate-700"
            >
              Search
            </button>
          </form>
          <span className="text-xs text-slate-400 font-semibold">Total Accounts: {users.length}</span>
        </div>

        {/* Users Table */}
        <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-slate-400 animate-pulse">Loading user accounts...</div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-slate-400">No user accounts found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3.5 px-4">Staff Name</th>
                    <th className="py-3.5 px-4">Username</th>
                    <th className="py-3.5 px-4">Role</th>
                    <th className="py-3.5 px-4">Assigned Location</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {users.map((u) => (
                    <tr key={u._id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-100">{u.name || u.username}</td>
                      <td className="py-3.5 px-4 font-mono text-blue-400">@{u.username}</td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2.5 py-0.5 rounded text-[11px] font-semibold border ${
                            u.role === "Admin"
                              ? "bg-rose-950 text-rose-300 border-rose-800"
                              : u.role === "Warehouse"
                              ? "bg-purple-950 text-purple-300 border-purple-800"
                              : u.role === "Accountant"
                              ? "bg-amber-950 text-amber-300 border-amber-800"
                              : "bg-blue-950 text-blue-300 border-blue-800"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-200">
                        {u.assignedLocation ? (
                          <span>
                            🏬 {u.assignedLocation.name} <span className="text-slate-500">({u.assignedLocation.type})</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">All Locations (Unrestricted)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            u.active
                              ? "bg-emerald-950 text-emerald-300 border-emerald-800"
                              : "bg-slate-800 text-slate-400 border-slate-700"
                          }`}
                        >
                          {u.active ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleToggleActive(u._id)}
                          className={`px-3 py-1 rounded text-xs font-semibold border transition ${
                            u.active
                              ? "bg-slate-800 hover:bg-slate-700 text-rose-300 border-slate-700"
                              : "bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-800"
                          }`}
                        >
                          {u.active ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* CREATE USER MODAL */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-100">👤 Create Staff / Salesman Account</h3>

              {modalError && (
                <div className="p-3 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                  ❌ {modalError}
                </div>
              )}

              <form onSubmit={handleCreateUser} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Kamran Ahmed"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Username *</label>
                  <input
                    type="text"
                    placeholder="e.g. kamran_g14"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Password *</label>
                  <input
                    type="password"
                    placeholder="Set account password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">User Role *</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Salesman">Salesman</option>
                    <option value="Branch">Branch Staff / Manager</option>
                    <option value="Warehouse">Warehouse Manager</option>
                    <option value="Accountant">Accountant</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Assigned Location (Default Branch)
                  </label>
                  <select
                    value={assignedLocation}
                    onChange={(e) => setAssignedLocation(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">-- All Locations / Unrestricted --</option>
                    {locations.map((loc) => (
                      <option key={loc._id} value={loc._id}>
                        {loc.name} ({loc.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow disabled:opacity-50"
                  >
                    {submitting ? "Creating..." : "Create Account"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
