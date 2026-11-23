import { useEffect, useState } from "react";
import { listMembers, inviteMember, updateMember, removeMember } from "../api/members.api";
import { useAuth } from "../context/AuthContext";
import Button from "../components/shared/Button";
import Input from "../components/shared/Input";
import Modal from "../components/shared/Modal";
import PhoneInput from "../components/shared/PhoneInput";

const roles = ["owner", "manager", "attendant"];
function RoleSelect({ value, onChange }) {
  return (
    <select
      aria-label="Role"
      className="control min-h-11 px-3 py-2 capitalize"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {roles.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  );
}

export default function MembersPage() {
  const { user } = useAuth();
  return <Team key={user?.workspaceId} canManage={user?.permissions?.includes("members:manage")} />;
}

function Team({ canManage }) {
  const [members, setMembers] = useState(null);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", role: "attendant" });

  useEffect(() => {
    let active = true;
    listMembers()
      .then((data) => active && setMembers(data))
      .catch(() => active && setError("Could not load members."));
    return () => {
      active = false;
    };
  }, []);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (dialog.type === "invite") {
        const invited = await inviteMember(form);
        setMembers((current) => [
          ...(current || []).filter((row) => row.id !== invited.id),
          invited,
        ]);
      } else if (dialog.type === "remove") {
        await removeMember(dialog.member.id);
        setMembers((current) => current.filter((row) => row.id !== dialog.member.id));
      } else {
        const updated = await updateMember(dialog.member.id, dialog.body);
        setMembers((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      }
      setDialog(null);
    } catch (err) {
      setError(err.response?.data?.error || "Could not save this change.");
    } finally {
      setBusy(false);
    }
  }

  function open(value) {
    setError("");
    setDialog(value);
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono-label">Workspace team</p>
          <h2 className="mt-2 text-2xl font-bold">Members</h2>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setForm({ name: "", phone: "", role: "attendant" });
              open({ type: "invite", title: "Invite a member" });
            }}
          >
            Invite member
          </Button>
        )}
      </header>
      {error && !dialog && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!members && !error && <p className="text-sm text-slate-500">Loading members…</p>}
      {members && (
        <ul className="panel divide-y divide-slate-100">
          {members.map((member) => (
            <li key={member.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <strong>{member.name || member.phone}</strong>
                <p className="text-xs text-slate-500">{member.phone}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize">
                  {member.role}
                </span>
                <span className="text-xs capitalize text-slate-500">{member.status}</span>
                {canManage && !member.self && (
                  <>
                    <RoleSelect
                      value={member.role}
                      onChange={(role) =>
                        open({ type: "update", title: "Change role", member, body: { role } })
                      }
                    />
                    {member.status !== "invited" && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          open({
                            type: "update",
                            title: member.status === "active" ? "Disable member" : "Enable member",
                            member,
                            body: { status: member.status === "active" ? "disabled" : "active" },
                          })
                        }
                      >
                        {member.status === "active" ? "Disable" : "Enable"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() => open({ type: "remove", title: "Remove member", member })}
                    >
                      Remove
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Modal open={Boolean(dialog)} onClose={() => !busy && setDialog(null)} title={dialog?.title}>
        <form className="space-y-4" onSubmit={save}>
          {dialog?.type === "invite" ? (
            <>
              <Input
                label="Name"
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <PhoneInput
                type="tel"
                pattern="[0-9]{10}"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                required
              />
              <RoleSelect value={form.role} onChange={(role) => setForm({ ...form, role })} />
            </>
          ) : (
            <p className="text-sm text-slate-600">
              Confirm this change for {dialog?.member?.name || dialog?.member?.phone}.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          <Button loading={busy}>
            {dialog?.type === "invite" ? "Send WhatsApp invite" : "Confirm"}
          </Button>
        </form>
      </Modal>
    </section>
  );
}
