import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  Shield, ArrowLeft, RefreshCw, Filter, Loader2, AlertCircle,
  CheckCircle2, Clock, Search, Download, ImageIcon, X, History,
  XCircle, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Team = "PLC" | "KYC" | "Transacional";
type ContestacaoStatus = "Pendente" | "Em Análise" | "Aceito" | "Recusado";

type StatusAudit = {
  status: ContestacaoStatus;
  changedAt: string;
  changedBy: string;
};

type Contestacao = {
  id: string;
  protocolo: string;
  team: Team;
  supervisor: string;
  item: string;
  date: string;
  time: string;
  tratativaId: string;
  justification: string;
  evidenceFileName?: string;
  status: ContestacaoStatus;
  statusHistory: StatusAudit[];
  createdAt: string;
};

const STATUS_STYLES: Record<ContestacaoStatus, string> = {
  Pendente: "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Em Análise": "bg-blue-100 text-blue-800 border-blue-200",
  Aceito: "bg-green-100 text-green-800 border-green-200",
  Recusado: "bg-red-100 text-red-800 border-red-200",
};

const STATUS_ICON: Record<ContestacaoStatus, React.ReactNode> = {
  Pendente: <Clock className="inline w-3 h-3 mr-1" />,
  "Em Análise": <Loader2 className="inline w-3 h-3 mr-1 animate-spin" />,
  Aceito: <CheckCircle2 className="inline w-3 h-3 mr-1" />,
  Recusado: <XCircle className="inline w-3 h-3 mr-1" />,
};

const TEAM_STYLES: Record<Team, string> = {
  PLC: "bg-purple-100 text-purple-700",
  KYC: "bg-orange-100 text-orange-700",
  Transacional: "bg-teal-100 text-teal-700",
};

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function evidenceUrl(filename: string) {
  return `/api/uploads/${encodeURIComponent(filename.replace("uploads/", ""))}`;
}

function exportCsv(rows: Contestacao[]) {
  const headers = [
    "Protocolo", "Time", "Supervisor", "Item", "Data Monitoria", "Horário",
    "ID Tratativa", "Justificativa", "Status", "Enviado em", "Evidência",
    "Última alteração por", "Data da última alteração",
  ];
  const esc = (v: string) => `"${(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((c) => {
    const last = c.statusHistory?.[c.statusHistory.length - 1];
    return [
      c.protocolo, c.team, c.supervisor, c.item, c.date, c.time,
      c.tratativaId, c.justification, c.status,
      new Date(c.createdAt).toLocaleString("pt-BR"),
      c.evidenceFileName ? evidenceUrl(c.evidenceFileName) : "",
      last?.changedBy ?? "", last ? new Date(last.changedAt).toLocaleString("pt-BR") : "",
    ].map(esc).join(";");
  });
  const bom = "\uFEFF";
  const csv = bom + [headers.map(esc).join(";"), ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `contestacoes_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function LoginScreen({ onLogin, error }: { onLogin: (pwd: string) => void; error: boolean }) {
  const [password, setPassword] = useState("");
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) onLogin(password);
  };
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-orange-100 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-orange-600" />
          </div>
          <h1 className="text-xl font-semibold text-foreground">Painel do Gestor</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesso restrito a supervisores autorizados</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="admin-password">
              Senha de acesso
            </label>
            <Input
              id="admin-password"
              type="password"
              placeholder="Digite a senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={error ? "border-destructive" : ""}
              autoFocus
            />
            {error && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />Senha incorreta. Tente novamente.
              </p>
            )}
          </div>
          <Button type="submit" className="w-full">Entrar</Button>
        </form>
        <div className="text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Voltar ao formulário
          </Link>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ContestacaoStatus }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_ICON[status]}{status}
    </span>
  );
}

function DetailModal({
  contestacao,
  onClose,
  onStatusChange,
  updating,
}: {
  contestacao: Contestacao;
  onClose: () => void;
  onStatusChange: (id: string, status: ContestacaoStatus, changedBy: string) => Promise<void>;
  updating: boolean;
}) {
  const [newStatus, setNewStatus] = useState<ContestacaoStatus>(contestacao.status);
  const [changedBy, setChangedBy] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (newStatus === contestacao.status) { onClose(); return; }
    if (!changedBy.trim()) return;
    setSaving(true);
    await onStatusChange(contestacao.id, newStatus, changedBy.trim());
    setSaving(false);
  };

  const imgUrl = contestacao.evidenceFileName ? evidenceUrl(contestacao.evidenceFileName) : null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card w-full max-w-2xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-card border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <p className="font-mono text-sm font-bold text-foreground">{contestacao.protocolo}</p>
            <p className="text-xs text-muted-foreground">{formatDate(contestacao.createdAt)}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={contestacao.status} />
            <Button variant="ghost" size="icon" onClick={onClose} className="w-8 h-8">
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {[
              { label: "Time", value: contestacao.team },
              { label: "Supervisor", value: contestacao.supervisor },
              { label: "Item", value: contestacao.item },
              { label: "Data da Monitoria", value: contestacao.date },
              { label: "Horário", value: contestacao.time },
              { label: "ID Tratativa", value: contestacao.tratativaId },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-sm font-medium text-foreground">{value}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Justificativa</p>
            <p className="text-sm text-foreground bg-muted/40 rounded-lg p-3 leading-relaxed">
              {contestacao.justification}
            </p>
          </div>

          {imgUrl && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <ImageIcon className="w-3 h-3" />Evidência anexada
              </p>
              <a href={imgUrl} target="_blank" rel="noopener noreferrer" className="inline-block group">
                <img
                  src={imgUrl}
                  alt="Evidência"
                  className="max-h-64 w-auto rounded-xl border border-border object-contain shadow group-hover:opacity-90 transition-opacity cursor-pointer"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                    const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                    if (next) next.style.display = "block";
                  }}
                />
                <span style={{ display: "none" }} className="text-xs text-primary underline">
                  Abrir imagem ({contestacao.evidenceFileName})
                </span>
              </a>
            </div>
          )}

          {contestacao.statusHistory?.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <History className="w-3 h-3" />Histórico de status
              </p>
              <div className="space-y-2">
                {[...contestacao.statusHistory].reverse().map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <StatusBadge status={h.status} />
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{formatDate(h.changedAt)}</span>
                    <span className="text-foreground font-medium">por {h.changedBy}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-3">
            <p className="text-sm font-medium text-foreground">Atualizar status</p>
            <div className="flex flex-wrap gap-3">
              <Select value={newStatus} onValueChange={(v) => setNewStatus(v as ContestacaoStatus)}>
                <SelectTrigger className="w-44 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pendente">Pendente</SelectItem>
                  <SelectItem value="Em Análise">Em Análise</SelectItem>
                  <SelectItem value="Aceito">Aceito</SelectItem>
                  <SelectItem value="Recusado">Recusado</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Nome do responsável (obrigatório)"
                value={changedBy}
                onChange={(e) => setChangedBy(e.target.value)}
                className="flex-1 min-w-[200px] h-9 text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={onClose}>Cancelar</Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving || updating || !changedBy.trim()}
                className="min-w-[100px]"
              >
                {saving ? <><Loader2 className="w-3 h-3 animate-spin mr-1" />Salvando...</> : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const { toast } = useToast();
  const [password, setPassword] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const [contestacoes, setContestacoes] = useState<Contestacao[]>([]);
  const [loading, setLoading] = useState(false);
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchContestacoes = useCallback(
    async (pwd: string, team?: string, status?: string) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (team) params.set("team", team);
        if (status) params.set("status", status);
        const res = await fetch(`/api/contestacoes?${params.toString()}`, {
          headers: { "x-admin-password": pwd },
        });
        if (res.status === 401) { setAuthError(true); setPassword(null); return; }
        const data: Contestacao[] = await res.json();
        setContestacoes(data);
        setAuthError(false);
      } catch {
        toast({ title: "Erro ao carregar dados", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const handleLogin = async (pwd: string) => {
    setPassword(pwd);
    await fetchContestacoes(pwd);
  };

  useEffect(() => {
    if (password) {
      fetchContestacoes(
        password,
        teamFilter !== "all" ? teamFilter : undefined,
        statusFilter !== "all" ? statusFilter : undefined
      );
    }
  }, [teamFilter, statusFilter, password, fetchContestacoes]);

  const handleStatusChange = async (id: string, newStatus: ContestacaoStatus, changedBy: string) => {
    if (!password) return;
    setUpdatingId(id);
    try {
      const res = await fetch(`/api/contestacoes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-password": password },
        body: JSON.stringify({ status: newStatus, changedBy }),
      });
      if (res.ok) {
        const updated: Contestacao = await res.json();
        setContestacoes((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        setSelectedId(null);
        toast({ title: "Status atualizado com sucesso" });
      }
    } catch {
      toast({ title: "Erro ao atualizar status", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  };

  if (!password) return <LoginScreen onLogin={handleLogin} error={authError} />;

  const filtered = contestacoes.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.protocolo.toLowerCase().includes(q) ||
      (c.tratativaId ?? "").toLowerCase().includes(q) ||
      (c.supervisor ?? "").toLowerCase().includes(q)
    );
  });

  const counts = {
    total: contestacoes.length,
    Pendente: contestacoes.filter((c) => c.status === "Pendente").length,
    "Em Análise": contestacoes.filter((c) => c.status === "Em Análise").length,
    Aceito: contestacoes.filter((c) => c.status === "Aceito").length,
    Recusado: contestacoes.filter((c) => c.status === "Recusado").length,
  };

  const selectedContestacao = selectedId ? filtered.find((c) => c.id === selectedId) ?? null : null;

  return (
    <div className="min-h-screen bg-background">
      {selectedContestacao && (
        <DetailModal
          contestacao={selectedContestacao}
          onClose={() => setSelectedId(null)}
          onStatusChange={handleStatusChange}
          updating={updatingId === selectedContestacao.id}
        />
      )}

      <header className="bg-orange-50 border-b border-orange-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-orange-900 leading-tight">Painel do Gestor</h1>
            <p className="text-xs text-orange-600">Gestão de Contestações de Monitoria de Qualidade</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              onClick={() => fetchContestacoes(password, teamFilter !== "all" ? teamFilter : undefined, statusFilter !== "all" ? statusFilter : undefined)}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />Atualizar
            </Button>
            <Button
              variant="outline" size="sm"
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
              className="gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />Exportar CSV
            </Button>
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-1.5">
                <ArrowLeft className="w-3.5 h-3.5" />Formulário
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total", value: counts.total, color: "bg-card", text: "text-foreground" },
            { label: "Pendente", value: counts.Pendente, color: "bg-yellow-50 border-yellow-200", text: "text-yellow-800" },
            { label: "Em Análise", value: counts["Em Análise"], color: "bg-blue-50 border-blue-200", text: "text-blue-800" },
            { label: "Aceito", value: counts.Aceito, color: "bg-green-50 border-green-200", text: "text-green-800" },
            { label: "Recusado", value: counts.Recusado, color: "bg-red-50 border-red-200", text: "text-red-800" },
          ].map(({ label, value, color, text }) => (
            <div key={label} className={`${color} border rounded-xl p-4 text-center shadow-sm`}>
              <p className={`text-2xl font-bold ${text}`}>{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-card border border-card-border rounded-xl p-4 shadow-sm">
          <div className="flex flex-wrap gap-3 items-center">
            <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-[180px]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder="Buscar protocolo, tratativa ou supervisor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 bg-background text-sm h-9"
                />
              </div>
            </div>
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-40 h-9 bg-background">
                <SelectValue placeholder="Todos os times" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os times</SelectItem>
                <SelectItem value="PLC">PLC</SelectItem>
                <SelectItem value="KYC">KYC</SelectItem>
                <SelectItem value="Transacional">Transacional</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-9 bg-background">
                <SelectValue placeholder="Todos os status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
                <SelectItem value="Em Análise">Em Análise</SelectItem>
                <SelectItem value="Aceito">Aceito</SelectItem>
                <SelectItem value="Recusado">Recusado</SelectItem>
              </SelectContent>
            </Select>
            {(teamFilter !== "all" || statusFilter !== "all" || searchQuery) && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setTeamFilter("all"); setStatusFilter("all"); setSearchQuery(""); }}
                className="text-muted-foreground h-9"
              >
                Limpar
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Carregando contestações...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">Nenhuma contestação encontrada</p>
            <p className="text-xs mt-1">Tente ajustar os filtros ou aguarde novos envios</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="w-full text-left bg-card border border-card-border rounded-xl p-5 shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-pointer group"
              >
                <div className="flex flex-wrap items-start gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold text-foreground">
                        {c.protocolo}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TEAM_STYLES[c.team]}`}>
                        {c.team}
                      </span>
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enviado em {formatDate(c.createdAt)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                    Ver detalhes <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <p className="text-muted-foreground">Tratativa</p>
                    <p className="font-medium text-foreground">{c.tratativaId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Supervisor</p>
                    <p className="font-medium text-foreground">{c.supervisor}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Item</p>
                    <p className="font-medium text-foreground">{c.item}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Data / Horário</p>
                    <p className="font-medium text-foreground">{c.date} às {c.time}</p>
                  </div>
                </div>
                {c.evidenceFileName && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                    <ImageIcon className="w-3 h-3" />Evidência anexada
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-border mt-12 py-6">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-muted-foreground">
          Painel de Gestão — Sistema de Contestação de Monitoria de Qualidade
        </div>
      </footer>
    </div>
  );
}
