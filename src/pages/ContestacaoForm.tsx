import { useState, useRef } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link } from "wouter";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  FileImage,
  X,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Shield,
  Clock,
  FileText,
  Info,
  Copy,
  LayoutDashboard,
  Loader2,
} from "lucide-react";

type Team = "PLC" | "KYC" | "Transacional" | "";

const TEAM_CONFIG: Record<
  "PLC" | "KYC" | "Transacional",
  { supervisors: string[]; items: string[] }
> = {
  PLC: {
    supervisors: ["Eliana", "Elisabete", "Gilson", "Jose"],
    items: ["A_101", "A_102", "A_201"],
  },
  KYC: {
    supervisors: ["Alan", "Caio", "Gabriela"],
    items: ["B101", "B104", "B201"],
  },
  Transacional: {
    supervisors: ["Alan", "Caio", "Gabriela"],
    items: ["B101", "B203", "B301"],
  },
};

const todayStr = new Date().toISOString().split("T")[0];

const formSchema = z.object({
  team: z.enum(["PLC", "KYC", "Transacional"], {
    required_error: "Selecione um time",
  }),
  supervisor: z.string().min(1, "Selecione um supervisor"),
  item: z.string().min(1, "Selecione um item"),
  date: z
    .string()
    .min(1, "Informe a data")
    .refine((val) => {
      if (!val) return true;
      return new Date(val) <= new Date(todayStr);
    }, "A data não pode ser no futuro"),
  time: z.string().min(1, "Informe o horário"),
  tratativaId: z.string().min(1, "Informe o ID da Tratativa"),
  justification: z
    .string()
    .min(10, "A justificativa deve ter pelo menos 10 caracteres"),
});

type FormValues = z.infer<typeof formSchema>;

function generateProtocolo(): string {
  const year = new Date().getFullYear();
  const num = Math.floor(1000 + Math.random() * 9000);
  return `SOLVA-${year}-${num}`;
}

function getDateWarning(dateVal: string, timeVal: string): string | null {
  if (!dateVal) return null;
  const dateTime = timeVal
    ? new Date(`${dateVal}T${timeVal}`)
    : new Date(dateVal);
  if (isNaN(dateTime.getTime())) return null;
  const now = new Date();
  const diffHours = (now.getTime() - dateTime.getTime()) / (1000 * 60 * 60);
  if (diffHours > 48) {
    return `Atenção: esta data está há mais de 48 horas no passado. O prazo máximo de submissão pode ter sido excedido (Não NCG: 48h, NCG: 24h).`;
  }
  if (diffHours > 24) {
    return `Atenção: esta data está há mais de 24 horas no passado. Verifique se o prazo NCG (máx. 24h) foi respeitado.`;
  }
  return null;
}

export default function ContestacaoForm() {
  const { toast } = useToast();
  const [selectedTeam, setSelectedTeam] = useState<Team>("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreview, setEvidencePreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [protocolo, setProtocolo] = useState<string>("");
  const [lastValues, setLastValues] = useState<FormValues | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      team: undefined,
      supervisor: "",
      item: "",
      date: "",
      time: "",
      tratativaId: "",
      justification: "",
    },
  });

  const watchedDate = useWatch({ control: form.control, name: "date" });
  const watchedTime = useWatch({ control: form.control, name: "time" });
  const dateWarning = getDateWarning(watchedDate, watchedTime);

  const teamConfig =
    selectedTeam && selectedTeam in TEAM_CONFIG
      ? TEAM_CONFIG[selectedTeam as "PLC" | "KYC" | "Transacional"]
      : null;

  const handleTeamChange = (value: string) => {
    setSelectedTeam(value as Team);
    form.setValue("supervisor", "");
    form.setValue("item", "");
  };

  const handleFileChange = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Arquivo inválido",
        description: "Por favor, selecione apenas arquivos de imagem.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Arquivo muito grande",
        description: "O arquivo deve ter no máximo 10MB.",
        variant: "destructive",
      });
      return;
    }
    setEvidenceFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setEvidencePreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileChange(file);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = () => {
    setEvidenceFile(null);
    setEvidencePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    const proto = generateProtocolo();
    try {
      let uploadedFileName: string | undefined;

      if (evidenceFile) {
        const formData = new FormData();
        formData.append("file", evidenceFile);
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json() as { filename: string };
          uploadedFileName = uploadData.filename;
        }
      }

      const res = await fetch("/api/contestacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          protocolo: proto,
          evidenceFileName: uploadedFileName,
        }),
      });
      if (!res.ok) throw new Error("Falha ao salvar");
      setProtocolo(proto);
      setLastValues(values);
      setSubmitted(true);
      toast({
        title: "Contestação enviada com sucesso!",
        description: `Protocolo: ${proto}`,
      });
    } catch {
      toast({
        title: "Erro ao enviar contestação",
        description: "Verifique sua conexão e tente novamente.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const copyProtocolo = () => {
    navigator.clipboard.writeText(protocolo);
    toast({ title: "Protocolo copiado!" });
  };

  if (submitted && lastValues) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-600" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-foreground mb-2">
              Contestação Enviada!
            </h2>
            <p className="text-muted-foreground text-sm">
              Sua contestação foi registrada com sucesso e será analisada pela
              equipe responsável.
            </p>
          </div>

          {/* Número de protocolo */}
          <div
            className="bg-orange-50 border border-orange-200 rounded-xl p-4"
            data-testid="box-protocolo"
          >
            <p className="text-xs text-orange-600 font-medium mb-1 uppercase tracking-wide">
              Número do Protocolo
            </p>
            <div className="flex items-center justify-center gap-2">
              <span
                className="text-xl font-mono font-bold text-orange-800"
                data-testid="text-protocolo"
              >
                {protocolo}
              </span>
              <button
                onClick={copyProtocolo}
                className="p-1.5 rounded-md hover:bg-orange-100 text-orange-500 transition-colors"
                title="Copiar protocolo"
                data-testid="button-copy-protocolo"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-orange-600 mt-1">
              Guarde este número para acompanhar sua contestação
            </p>
          </div>

          <div className="bg-card border border-card-border rounded-xl p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="w-4 h-4" />
              <span>
                Tratativa:{" "}
                <span className="font-medium text-foreground">
                  {lastValues.tratativaId}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Shield className="w-4 h-4" />
              <span>
                Time:{" "}
                <span className="font-medium text-foreground">
                  {lastValues.team}
                </span>{" "}
                — Supervisor:{" "}
                <span className="font-medium text-foreground">
                  {lastValues.supervisor}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>
                Data:{" "}
                <span className="font-medium text-foreground">
                  {lastValues.date} às {lastValues.time}
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              onClick={() => {
                setSubmitted(false);
                setLastValues(null);
                form.reset();
                setSelectedTeam("");
                removeFile();
              }}
              variant="outline"
              className="flex-1"
              data-testid="button-nova-contestacao"
            >
              Nova Contestação
            </Button>
            <Link href="/admin" className="flex-1">
              <Button
                variant="default"
                className="w-full gap-2"
                data-testid="button-go-admin"
              >
                <LayoutDashboard className="w-4 h-4" />
                Ver Painel
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-orange-50 border-b border-orange-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center flex-shrink-0 shadow-sm">
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h1 className="text-base font-semibold text-orange-900 leading-tight">
              Contestação de Monitoria de Qualidade
            </h1>
            <p className="text-xs text-orange-600">
              Preencha os dados abaixo para registrar sua contestação
            </p>
          </div>
          <Link href="/admin">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-orange-700 hover:bg-orange-100"
              data-testid="link-admin"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Gestor</span>
            </Button>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-6"
            data-testid="form-contestacao"
          >
            {/* ETAPA 1 — IDENTIFICAÇÃO DO TIME */}
            <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                  <span className="text-xs font-bold text-orange-700">1</span>
                </div>
                <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                  Identificação do Time
                </h2>
              </div>

              <div
                className="mb-5 bg-orange-50 border border-orange-200 rounded-lg p-4 flex gap-3"
                data-testid="alert-boas-praticas"
              >
                <Info className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-orange-800">
                  <p className="font-semibold mb-1.5">
                    ✅ Boas Práticas e Requisitos Essenciais:
                  </p>
                  <ul className="space-y-1 text-orange-700">
                    <li>
                      • O envio é de responsabilidade do{" "}
                      <span className="font-semibold">
                        Líder Operacional (Supervisor)
                      </span>
                      .
                    </li>
                    <li>
                      •{" "}
                      <span className="font-semibold">
                        Prazos de Submissão:
                      </span>{" "}
                      NCG (Máximo 24h), Não NCG (Máximo 48h).
                    </li>
                  </ul>
                </div>
              </div>

              <FormField
                control={form.control}
                name="team"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium">Time *</FormLabel>
                    <Select
                      onValueChange={(val) => {
                        field.onChange(val);
                        handleTeamChange(val);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger
                          data-testid="select-team"
                          className="bg-background"
                        >
                          <SelectValue placeholder="Selecione o time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PLC" data-testid="option-plc">
                          PLC
                        </SelectItem>
                        <SelectItem value="KYC" data-testid="option-kyc">
                          KYC
                        </SelectItem>
                        <SelectItem
                          value="Transacional"
                          data-testid="option-transacional"
                        >
                          Transacional
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* ETAPA 2 — DETALHES DA MONITORIA */}
            {selectedTeam && teamConfig && (
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-orange-700">2</span>
                  </div>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Detalhes da Monitoria
                  </h2>
                  <span className="ml-auto text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                    {selectedTeam}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="supervisor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Supervisor *
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger
                              data-testid="select-supervisor"
                              className="bg-background"
                            >
                              <SelectValue placeholder="Selecione o supervisor" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {teamConfig.supervisors.map((sup) => (
                              <SelectItem
                                key={sup}
                                value={sup}
                                data-testid={`option-supervisor-${sup.toLowerCase()}`}
                              >
                                {sup}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="item"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Item Contestado *
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger
                              data-testid="select-item"
                              className="bg-background"
                            >
                              <SelectValue placeholder="Selecione o item" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {teamConfig.items.map((item) => (
                              <SelectItem
                                key={item}
                                value={item}
                                data-testid={`option-item-${item.toLowerCase()}`}
                              >
                                {item}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* ETAPA 3 — DADOS DA TRATATIVA */}
            {selectedTeam && (
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-orange-700">3</span>
                  </div>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Dados da Tratativa
                  </h2>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="tratativaId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-1">
                        <FormLabel className="text-sm font-medium">
                          ID da Tratativa *
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Ex: TRT-00123"
                            className="bg-background"
                            data-testid="input-tratativa-id"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Data *
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="date"
                            max={todayStr}
                            className="bg-background"
                            data-testid="input-date"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="time"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Horário *
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="time"
                            className="bg-background"
                            data-testid="input-time"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {dateWarning && (
                  <div
                    className="mt-4 flex gap-3 bg-red-50 border border-red-200 rounded-lg p-3"
                    data-testid="alert-date-warning"
                  >
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700">{dateWarning}</p>
                  </div>
                )}

                <div className="mt-4">
                  <FormField
                    control={form.control}
                    name="justification"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">
                          Justificativa *
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            placeholder="Descreva detalhadamente os motivos da sua contestação..."
                            className="bg-background min-h-[120px] resize-none"
                            data-testid="textarea-justification"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            )}

            {/* ETAPA 4 — EVIDÊNCIA */}
            {selectedTeam && (
              <div className="bg-card border border-card-border rounded-xl p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-5">
                  <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center">
                    <span className="text-xs font-bold text-orange-700">4</span>
                  </div>
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wide">
                    Evidência
                  </h2>
                  <span className="ml-auto text-xs text-muted-foreground">
                    Opcional
                  </span>
                </div>

                {!evidenceFile ? (
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                    data-testid="dropzone-evidence"
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${
                      isDragging
                        ? "border-orange-400 bg-orange-50"
                        : "border-border hover:border-orange-300 hover:bg-orange-50/40"
                    }`}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <Upload className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Arraste uma imagem ou clique para selecionar
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PNG, JPG, JPEG, GIF — máx. 10MB
                        </p>
                      </div>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      data-testid="input-evidence-file"
                      onChange={(e) =>
                        handleFileChange(e.target.files?.[0] ?? null)
                      }
                    />
                  </div>
                ) : (
                  <div className="relative border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-3 p-3 bg-muted/30">
                      <div className="w-10 h-10 rounded-md overflow-hidden flex-shrink-0 bg-muted">
                        {evidencePreview && (
                          <img
                            src={evidencePreview}
                            alt="Evidência"
                            className="w-full h-full object-cover"
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {evidenceFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {(evidenceFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <FileImage className="w-4 h-4 text-green-500" />
                        <button
                          type="button"
                          onClick={removeFile}
                          data-testid="button-remove-evidence"
                          className="w-7 h-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {evidencePreview && (
                      <div className="max-h-48 overflow-hidden">
                        <img
                          src={evidencePreview}
                          alt="Preview da evidência"
                          className="w-full object-contain bg-muted/20"
                          style={{ maxHeight: 192 }}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {selectedTeam && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
                <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-orange-800 mb-0.5">Atenção</p>
                  <p className="text-orange-700">
                    Certifique-se de que todas as informações estão corretas
                    antes de enviar. Após o envio, a contestação será analisada
                    pelo supervisor indicado.
                  </p>
                </div>
              </div>
            )}

            {selectedTeam && (
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="lg"
                  className="gap-2 px-8"
                  disabled={submitting}
                  data-testid="button-submit"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      Enviar Contestação
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            )}

            {!selectedTeam && (
              <div className="text-center py-12 text-muted-foreground">
                <Shield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p className="text-sm">
                  Selecione um time para iniciar o preenchimento
                </p>
              </div>
            )}
          </form>
        </Form>
      </main>

      <footer className="border-t border-border mt-12 py-6">
        <div className="max-w-3xl mx-auto px-4 text-center text-xs text-muted-foreground">
          Sistema de Contestação de Monitoria de Qualidade
        </div>
      </footer>
    </div>
  );
}
