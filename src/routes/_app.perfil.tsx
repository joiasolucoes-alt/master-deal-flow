import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Edit, Save, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { UserAvatar } from "@/components/app/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppContext } from "@/features/app/app-context";

export const Route = createFileRoute("/_app/perfil")({
  component: ProfilePage,
});

function ProfilePage() {
  const { auth, updateCurrentProfile } = useAppContext();
  const user = auth.user;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(user?.name ?? "");
  }, [user?.name]);

  async function saveProfile() {
    setSaving(true);
    try {
      const result = await updateCurrentProfile({ name });
      if (!result.ok) {
        toast.error(result.message ?? "Não foi possível salvar o perfil.");
        return;
      }
      toast.success("Perfil atualizado.");
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meu perfil"
        description="Consulte seus dados de acesso e atualize as informações básicas do perfil."
      />

      <Card className="max-w-3xl shadow-card">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar
              name={user?.name ?? "Usuário"}
              initials={user?.initials ?? "MF"}
              className="h-14 w-14"
            />
            <div className="min-w-0">
              <CardTitle className="truncate">{user?.name ?? "Usuário"}</CardTitle>
              <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            </div>
          </div>
          {!editing ? (
            <Button onClick={() => setEditing(true)}>
              <Edit /> Editar
            </Button>
          ) : null}
        </CardHeader>

        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="profile-name">Nome</Label>
            <Input
              id="profile-name"
              value={name}
              disabled={!editing || saving}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>E-mail</Label>
            <Input value={user?.email ?? ""} disabled />
          </div>

          <div className="space-y-2">
            <Label>Perfil de acesso</Label>
            <Input value={user?.role ?? "Sem perfil"} disabled />
          </div>

          <div className="space-y-2">
            <Label>Unidade</Label>
            <Input value={user?.unit ?? "Sem unidade"} disabled />
          </div>

          {editing ? (
            <div className="flex gap-2 md:col-span-2">
              <Button onClick={saveProfile} disabled={saving}>
                <Save /> {saving ? "Salvando..." : "Salvar"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setName(user?.name ?? "");
                  setEditing(false);
                }}
                disabled={saving}
              >
                <X /> Cancelar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
