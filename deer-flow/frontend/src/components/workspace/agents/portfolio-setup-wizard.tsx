"use client";

import {
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FileUpIcon,
  LandmarkIcon,
  PlusIcon,
  SaveIcon,
  TargetIcon,
  Trash2Icon,
  WalletCardsIcon,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { accountStorageKey } from "@/core/auth/account-storage";
import { useAuth } from "@/core/auth/AuthProvider";
import {
  parsePortfolioCsv,
  readStoredRiskProfile,
  riskProfileStrategyPrefill,
  type PortfolioSetupResponse,
  type PortfolioSetupPositionInput,
  type PortfolioSetupRequest,
  usePortfolioSetup,
} from "@/core/finance";
import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";

const STEP_COUNT = 3;

interface SetupDraft {
  idempotencyKey: string;
  name: string;
  purpose: string;
  baseCurrency: string;
  benchmark: string;
  positions: PortfolioSetupPositionInput[];
  cashCurrency: string;
  cashAmount: string;
  objective: string;
  horizon: string;
}

function createIdempotencyKey() {
  const suffix =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `workspace-${suffix}`;
}

function emptyPosition(currency = "CNY"): PortfolioSetupPositionInput {
  return {
    market: "",
    symbol: "",
    name: "",
    quantity: "",
    averageCost: "",
    currency,
  };
}

function createDraft(): SetupDraft {
  return {
    idempotencyKey: createIdempotencyKey(),
    name: "",
    purpose: "",
    baseCurrency: "CNY",
    benchmark: "",
    positions: [emptyPosition()],
    cashCurrency: "CNY",
    cashAmount: "",
    objective: "",
    horizon: "",
  };
}

function interpolate(source: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    source,
  );
}

function isBlankPosition(position: PortfolioSetupPositionInput) {
  return [
    position.market,
    position.symbol,
    position.name,
    position.quantity,
    position.averageCost,
  ].every((value) => value.trim() === "");
}

function isValidPosition(position: PortfolioSetupPositionInput) {
  return (
    position.market.trim() !== "" &&
    position.symbol.trim() !== "" &&
    position.currency.trim() !== "" &&
    Number.isFinite(Number(position.quantity)) &&
    Number(position.quantity) > 0 &&
    Number.isFinite(Number(position.averageCost)) &&
    Number(position.averageCost) >= 0
  );
}

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: string;
}) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
    </label>
  );
}

export function PortfolioSetupWizard({
  onCompleted,
}: {
  onCompleted?: (result: PortfolioSetupResponse) => void | Promise<void>;
}) {
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const labels = t.investmentAgent;
  const setup = usePortfolioSetup();
  const [draft, setDraft] = useState<SetupDraft>(() => createDraft());
  const [step, setStep] = useState(1);
  const [draftReady, setDraftReady] = useState(false);
  const [loadedDraftStorageKey, setLoadedDraftStorageKey] = useState<
    string | null
  >(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);
  const draftStorageKey = user
    ? accountStorageKey(user.id, "portfolio.setup.v1")
    : null;

  useEffect(() => {
    setDraftReady(false);
    setLoadedDraftStorageKey(null);
    if (!draftStorageKey) return;
    const initialDraft = createDraft();
    const profile = user?.id ? readStoredRiskProfile(user.id) : null;
    const prefill = profile
      ? riskProfileStrategyPrefill(profile, locale)
      : null;
    if (prefill) {
      initialDraft.objective = prefill.objective;
      initialDraft.horizon = prefill.horizon;
    }
    try {
      const saved = localStorage.getItem(draftStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<SetupDraft>;
        setDraft({
          ...initialDraft,
          ...parsed,
          idempotencyKey: parsed.idempotencyKey ?? initialDraft.idempotencyKey,
          objective:
            typeof parsed.objective === "string" && parsed.objective.trim()
              ? parsed.objective
              : initialDraft.objective,
          horizon:
            typeof parsed.horizon === "string" && parsed.horizon.trim()
              ? parsed.horizon
              : initialDraft.horizon,
          positions:
            Array.isArray(parsed.positions) && parsed.positions.length > 0
              ? parsed.positions
              : initialDraft.positions,
        });
      } else {
        setDraft(initialDraft);
      }
    } catch {
      localStorage.removeItem(draftStorageKey);
      setDraft(initialDraft);
    } finally {
      setLoadedDraftStorageKey(draftStorageKey);
      setDraftReady(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    if (
      !draftReady ||
      !draftStorageKey ||
      loadedDraftStorageKey !== draftStorageKey
    )
      return;
    localStorage.setItem(draftStorageKey, JSON.stringify(draft));
  }, [draft, draftReady, draftStorageKey, loadedDraftStorageKey]);

  const stepLabels = [
    labels.setupPortfolioStep,
    labels.setupAccountStep,
    labels.setupStrategyStep,
  ];
  const completedPositions = draft.positions.filter(
    (position) => !isBlankPosition(position),
  );

  function validate(targetStep: number) {
    if (targetStep >= 1 && draft.name.trim() === "") {
      return labels.setupPortfolioRequired;
    }
    if (targetStep >= 2) {
      if (completedPositions.some((position) => !isValidPosition(position))) {
        return labels.setupPositionInvalid;
      }
      const validCash =
        draft.cashAmount.trim() !== "" &&
        Number.isFinite(Number(draft.cashAmount)) &&
        Number(draft.cashAmount) > 0;
      if (completedPositions.length === 0 && !validCash) {
        return labels.setupAccountRequired;
      }
    }
    if (targetStep >= 3 && draft.objective.trim() === "") {
      return labels.setupStrategyRequired;
    }
    return null;
  }

  function continueToNextStep() {
    const error = validate(step);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    setStep((current) => Math.min(STEP_COUNT, current + 1));
  }

  function updatePosition(
    index: number,
    field: keyof PortfolioSetupPositionInput,
    value: string,
  ) {
    setDraft((current) => ({
      ...current,
      positions: current.positions.map((position, positionIndex) =>
        positionIndex === index ? { ...position, [field]: value } : position,
      ),
    }));
  }

  function removePosition(index: number) {
    setDraft((current) => {
      const positions = current.positions.filter(
        (_, positionIndex) => positionIndex !== index,
      );
      return {
        ...current,
        positions:
          positions.length > 0
            ? positions
            : [emptyPosition(current.baseCurrency)],
      };
    });
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = parsePortfolioCsv(await file.text());
    if (result.errors.length > 0) {
      setCsvMessage(result.errors.join(" · "));
      return;
    }
    if (result.positions.length === 0) {
      setCsvMessage(labels.setupAccountRequired);
      return;
    }
    setDraft((current) => ({ ...current, positions: result.positions }));
    setCsvMessage(
      interpolate(labels.setupCsvImported, { count: result.positions.length }),
    );
    setValidationError(null);
  }

  async function complete(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < STEP_COUNT) {
      continueToNextStep();
      return;
    }
    const error = validate(STEP_COUNT);
    if (error) {
      setValidationError(error);
      return;
    }
    setValidationError(null);
    const profile = user?.id ? readStoredRiskProfile(user.id) : null;
    const prefill = profile
      ? riskProfileStrategyPrefill(profile, locale)
      : null;
    const request: PortfolioSetupRequest = {
      idempotencyKey: draft.idempotencyKey,
      portfolio: {
        name: draft.name.trim(),
        purpose: draft.purpose.trim(),
        baseCurrency: draft.baseCurrency,
        benchmark: draft.benchmark.trim() || null,
      },
      account: {
        asOf: new Date().toISOString(),
        source: "investment_workspace",
        positions: completedPositions.map((position) => ({
          ...position,
          market: position.market.trim().toUpperCase(),
          symbol: position.symbol.trim().toUpperCase(),
          name: position.name.trim(),
          currency: position.currency.trim().toUpperCase(),
        })),
        cashBalances:
          draft.cashAmount.trim() === ""
            ? []
            : [
                {
                  currency: draft.cashCurrency,
                  amount: draft.cashAmount.trim(),
                },
              ],
      },
      strategy: {
        objective: draft.objective.trim(),
        horizon: draft.horizon.trim(),
        benchmark: draft.benchmark.trim() || null,
        policy: prefill?.policy ?? {},
        activate: true,
      },
      captureSnapshot: true,
    };

    try {
      const result = await setup.mutateAsync(request);
      if (draftStorageKey) localStorage.removeItem(draftStorageKey);
      await onCompleted?.(result);
    } catch {
      // The mutation error is rendered below and the idempotency key is kept
      // so a retry cannot create a duplicate portfolio.
    }
  }

  const mutationError =
    setup.error instanceof Error ? setup.error.message : null;

  return (
    <Card className="overflow-hidden border-sky-500/20 py-0 shadow-sm">
      <div className="via-background bg-gradient-to-br from-sky-500/[0.10] to-emerald-500/[0.08] px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge
              variant="outline"
              className="bg-background/70 border-sky-500/25 text-sky-700 dark:text-sky-300"
            >
              <WalletCardsIcon />
              {labels.setupEyebrow}
            </Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
              {labels.setupTitle}
            </h2>
            <p className="text-muted-foreground mt-2 max-w-xl text-sm leading-6">
              {labels.setupDescription}
            </p>
          </div>
          <div className="bg-background/75 min-w-64 rounded-xl border p-4 backdrop-blur-sm">
            <div className="mb-2 flex items-center justify-between gap-4 text-xs">
              <span className="font-medium">
                {interpolate(labels.setupStepOf, {
                  current: step,
                  total: STEP_COUNT,
                })}
              </span>
              <span className="text-muted-foreground flex items-center gap-1.5">
                <SaveIcon className="size-3.5" />
                {labels.setupDraftSaved}
              </span>
            </div>
            <Progress value={(step / STEP_COUNT) * 100} />
          </div>
        </div>
      </div>

      <form onSubmit={complete}>
        <CardContent className="px-5 py-6 sm:px-8 sm:py-8">
          <ol
            className="mb-7 grid grid-cols-3 gap-2"
            aria-label={labels.setupStepOf}
          >
            {stepLabels.map((label, index) => {
              const itemStep = index + 1;
              const active = itemStep === step;
              const complete = itemStep < step;
              return (
                <li
                  key={label}
                  className={cn(
                    "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                    active && "border-primary/30 bg-primary/5 text-primary",
                    complete &&
                      "border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300",
                    !active && !complete && "text-muted-foreground",
                  )}
                >
                  {complete ? (
                    <CheckCircle2Icon className="size-4 shrink-0" />
                  ) : (
                    <span className="bg-background flex size-5 shrink-0 items-center justify-center rounded-full border font-mono text-[10px]">
                      {itemStep}
                    </span>
                  )}
                  <span className="truncate">{label}</span>
                </li>
              );
            })}
          </ol>

          {step === 1 ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                  <WalletCardsIcon className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{labels.setupPortfolioStep}</h3>
                  <p className="text-muted-foreground text-sm">
                    {labels.emptyPortfolioDescription}
                  </p>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <FieldLabel htmlFor="setup-name">
                    {labels.setupPortfolioName}
                  </FieldLabel>
                  <Input
                    id="setup-name"
                    autoFocus
                    value={draft.name}
                    placeholder={labels.setupPortfolioNamePlaceholder}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <FieldLabel htmlFor="setup-purpose">
                    {labels.setupPurpose}
                  </FieldLabel>
                  <Textarea
                    id="setup-purpose"
                    value={draft.purpose}
                    placeholder={labels.setupPurposePlaceholder}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        purpose: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <FieldLabel>{labels.setupBaseCurrency}</FieldLabel>
                  <Select
                    value={draft.baseCurrency}
                    onValueChange={(value) =>
                      setDraft((current) => ({
                        ...current,
                        baseCurrency: value,
                        cashCurrency:
                          current.cashCurrency === current.baseCurrency
                            ? value
                            : current.cashCurrency,
                      }))
                    }
                  >
                    <SelectTrigger aria-label={labels.setupBaseCurrency}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["CNY", "HKD", "USD"].map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <FieldLabel htmlFor="setup-benchmark">
                    {labels.setupBenchmark}
                  </FieldLabel>
                  <Input
                    id="setup-benchmark"
                    value={draft.benchmark}
                    placeholder={labels.setupBenchmarkPlaceholder}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        benchmark: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-7">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                    <LandmarkIcon className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{labels.setupPositions}</h3>
                    <p className="text-muted-foreground text-sm">
                      {labels.setupPositionsDescription}
                    </p>
                  </div>
                </div>
                <Button type="button" variant="outline" asChild>
                  <label className="cursor-pointer">
                    <FileUpIcon />
                    {labels.setupImportCsv}
                    <input
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      onChange={(event) => void importCsv(event)}
                    />
                  </label>
                </Button>
              </div>
              <p className="text-muted-foreground -mt-4 text-xs">
                {csvMessage ?? labels.setupCsvHint}
              </p>

              <div className="space-y-3">
                {draft.positions.map((position, index) => (
                  <div
                    key={index}
                    className="bg-muted/20 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-[0.8fr_1fr_1.4fr_1fr_1fr_0.8fr_auto]"
                  >
                    {(
                      [
                        ["market", labels.setupMarket, "SH"],
                        ["symbol", labels.setupSymbol, "600519"],
                        ["name", labels.setupAssetName, ""],
                        ["quantity", labels.setupQuantity, "10"],
                        ["averageCost", labels.setupAverageCost, "1400"],
                        ["currency", labels.setupCurrency, draft.baseCurrency],
                      ] as const
                    ).map(([field, label, placeholder]) => (
                      <div key={field} className="space-y-1.5">
                        <FieldLabel>{label}</FieldLabel>
                        <Input
                          value={position[field]}
                          inputMode={
                            field === "quantity" || field === "averageCost"
                              ? "decimal"
                              : undefined
                          }
                          placeholder={placeholder}
                          aria-label={`${label} ${index + 1}`}
                          onChange={(event) =>
                            updatePosition(index, field, event.target.value)
                          }
                        />
                      </div>
                    ))}
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={labels.setupRemovePosition}
                        onClick={() => removePosition(index)}
                      >
                        <Trash2Icon />
                      </Button>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      positions: [
                        ...current.positions,
                        emptyPosition(current.baseCurrency),
                      ],
                    }))
                  }
                >
                  <PlusIcon />
                  {labels.setupAddPosition}
                </Button>
              </div>

              <div className="rounded-xl border p-4">
                <h3 className="font-medium">{labels.setupCash}</h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {labels.setupCashDescription}
                </p>
                <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-[1fr_160px]">
                  <div className="space-y-1.5">
                    <FieldLabel htmlFor="setup-cash">
                      {labels.setupCashAmount}
                    </FieldLabel>
                    <Input
                      id="setup-cash"
                      inputMode="decimal"
                      value={draft.cashAmount}
                      placeholder="100000"
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          cashAmount: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <FieldLabel>{labels.setupCurrency}</FieldLabel>
                    <Select
                      value={draft.cashCurrency}
                      onValueChange={(value) =>
                        setDraft((current) => ({
                          ...current,
                          cashCurrency: value,
                        }))
                      }
                    >
                      <SelectTrigger aria-label={labels.setupCurrency}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {["CNY", "HKD", "USD"].map((currency) => (
                          <SelectItem key={currency} value={currency}>
                            {currency}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mx-auto max-w-4xl space-y-6">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-xl">
                  <TargetIcon className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{labels.setupStrategyStep}</h3>
                  <p className="text-muted-foreground text-sm">
                    {labels.setupReviewTitle}
                  </p>
                </div>
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <FieldLabel htmlFor="setup-objective">
                    {labels.setupObjective}
                  </FieldLabel>
                  <Textarea
                    id="setup-objective"
                    autoFocus
                    value={draft.objective}
                    placeholder={labels.setupObjectivePlaceholder}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        objective: event.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <FieldLabel htmlFor="setup-horizon">
                    {labels.setupHorizon}
                  </FieldLabel>
                  <Input
                    id="setup-horizon"
                    value={draft.horizon}
                    placeholder={labels.setupHorizonPlaceholder}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        horizon: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="gap-2 py-4 shadow-none">
                  <CardHeader className="px-4">
                    <CardDescription>
                      {labels.setupReviewPortfolio}
                    </CardDescription>
                    <CardTitle className="text-base">
                      {draft.name || "—"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground px-4 text-xs">
                    {draft.baseCurrency} · {draft.benchmark || "—"}
                  </CardContent>
                </Card>
                <Card className="gap-2 py-4 shadow-none">
                  <CardHeader className="px-4">
                    <CardDescription>
                      {labels.setupReviewAccount}
                    </CardDescription>
                    <CardTitle className="text-base">
                      {completedPositions.length} {labels.portfolioPositions}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground px-4 text-xs">
                    {draft.cashAmount
                      ? `${draft.cashAmount} ${draft.cashCurrency}`
                      : labels.portfolioCash}
                  </CardContent>
                </Card>
                <Card className="gap-2 py-4 shadow-none">
                  <CardHeader className="px-4">
                    <CardDescription>
                      {labels.setupReviewStrategy}
                    </CardDescription>
                    <CardTitle className="line-clamp-2 text-base">
                      {draft.objective || "—"}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-muted-foreground px-4 text-xs">
                    {draft.horizon || "—"}
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : null}

          {validationError || mutationError ? (
            <div
              role="alert"
              className="bg-destructive/5 text-destructive mx-auto mt-6 max-w-4xl rounded-lg border border-red-500/20 px-4 py-3 text-sm"
            >
              {validationError ?? mutationError ?? labels.setupFailed}
            </div>
          ) : null}

          <div className="mx-auto mt-8 flex max-w-4xl items-center justify-between border-t pt-5">
            <Button
              type="button"
              variant="ghost"
              disabled={step === 1 || setup.isPending}
              onClick={() => {
                setValidationError(null);
                setStep((current) => Math.max(1, current - 1));
              }}
            >
              <ChevronLeftIcon />
              {labels.setupBack}
            </Button>
            {step < STEP_COUNT ? (
              <Button type="submit">
                {labels.setupNext}
                <ChevronRightIcon />
              </Button>
            ) : (
              <Button type="submit" disabled={setup.isPending}>
                {setup.isPending ? labels.setupSaving : labels.setupComplete}
                {!setup.isPending ? <CheckCircle2Icon /> : null}
              </Button>
            )}
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
