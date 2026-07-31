"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  BadgePercent,
  Bell,
  CalendarDays,
  CalendarRange,
  ChartNoAxesCombined,
  CircleDollarSign,
  Clock3,
  CreditCard,
  History,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  LogIn,
  LogOut,
  MessageCircle,
  PackageOpen,
  Scissors,
  Search,
  Settings,
  ShieldCheck,
  Store,
  UserRound,
  UsersRound,
} from "lucide-react";

type View = "landing" | "login" | "admin" | "master" | "booking";
type QuickAction = "appointment" | "client" | "blocked";

const appointments = [
  { time: "10:00", name: "Lucas Almeida", service: "Corte", barber: "Thiago", status: "Confirmado" },
  { time: "11:00", name: "Rafael Costa", service: "Corte", barber: "Dav", status: "Confirmado" },
  { time: "13:30", name: "Bruno Martins", service: "Corte", barber: "Thiago", status: "Aguardando" },
  { time: "15:00", name: "Gabriel Souza", service: "Corte", barber: "Dav", status: "Confirmado" },
];

const navItems = ["Visão geral", "Agenda", "Clientes", "Equipe", "Serviços", "Financeiro", "Estoque"];
const adminNavIcons = [LayoutDashboard, CalendarDays, UserRound, UsersRound, Scissors, CircleDollarSign, PackageOpen];
const masterNavItems = ["Visão geral", "Estabelecimentos", "Assinaturas", "Planos", "Usuários Master", "Atividades", "Suporte"];
const masterNavIcons = [LayoutDashboard, Store, CreditCard, BadgePercent, UsersRound, History, LifeBuoy];
type PanelPermissions = { agenda: boolean; clients: boolean; finance: boolean; settings: boolean };
const allPanelPermissions: PanelPermissions = { agenda: true, clients: true, finance: true, settings: true };

type BusinessConfig = {
  services: { name: string; price: number; duration: number; active: boolean }[];
  barbers: {
    name: string;
    email: string;
    phone: string;
    photoKey: string | null;
    accessEnabled: boolean;
    accessMustChange: boolean;
    role: string;
    commission: number;
    services: string[];
    workDays: string[];
    workStart: string;
    workEnd: string;
    breakStart: string;
    breakEnd: string;
    timeOff: { start: string; end: string; label: string }[];
    permissions: { agenda: boolean; clients: boolean; finance: boolean; settings: boolean };
    active: boolean;
  }[];
  hours: { label: string; days: string; open: string; close: string; active: boolean }[];
};

type Appointment = {
  id: number;
  customerName: string;
  phone: string;
  ownerEmail: string | null;
  logoUrl: string | null;
  businessType: "salon" | "barbershop";
  theme: "black" | "white";
  barber: string;
  service: string;
  date: string;
  time: string;
  status: "confirmed" | "waiting" | "completed" | "cancelled" | "blocked";
};

type ClientSummary = {
  phone: string;
  name: string;
  appointments: number;
  completed: number;
  lastVisit: string;
  firstVisit: string;
  totalSpent: number;
};

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  city: string;
  phone: string;
  ownerEmail: string | null;
  logoUrl: string | null;
  active: boolean;
  plan: string;
  appointments: number;
  lastAppointment: string | null;
};

type AuditEntry = {
  id: number;
  tenantId: string | null;
  tenantName: string;
  action: string;
  category: string;
  description: string;
  actorEmail: string;
  createdAt: number;
};

type PlatformAdminSummary = {
  email: string;
  displayName: string;
  primary: boolean;
  current: boolean;
  createdAt?: number;
};

type TenantOnboarding = {
  name: string;
  slug: string;
  city: string;
  phone: string;
  ownerEmail: string;
  managerPassword: string;
  businessType: "salon" | "barbershop";
  theme: "black" | "white";
  plan: string;
  serviceName: string;
  servicePrice: string;
  serviceDuration: string;
  professionalName: string;
  professionalEmail: string;
  open: string;
  close: string;
  active: boolean;
};

const defaultConfig: BusinessConfig = {
  services: [{ name: "Corte", price: 50, duration: 50, active: true }],
  barbers: [
    { name: "Thiago", email: "", phone: "", photoKey: null, accessEnabled: false, accessMustChange: false, role: "Barbeiro", commission: 30, services: ["Corte"], workDays: ["2", "3", "4", "5", "6"], workStart: "10:00", workEnd: "20:00", breakStart: "12:00", breakEnd: "13:00", timeOff: [], permissions: { agenda: true, clients: true, finance: false, settings: false }, active: true },
    { name: "Dav", email: "", phone: "", photoKey: null, accessEnabled: false, accessMustChange: false, role: "Barbeiro", commission: 30, services: ["Corte"], workDays: ["2", "3", "4", "5", "6"], workStart: "10:00", workEnd: "20:00", breakStart: "12:00", breakEnd: "13:00", timeOff: [], permissions: { agenda: true, clients: true, finance: false, settings: false }, active: true },
  ],
  hours: [
    { label: "Terça a sexta", days: "2,3,4,5", open: "10:00", close: "20:00", active: true },
    { label: "Sábado", days: "6", open: "09:00", close: "17:00", active: true },
  ],
};

const LIVE_REFRESH_INTERVAL = 15_000;

function useAutoRefresh(refresh: () => void, enabled = true) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });
  useEffect(() => {
    if (!enabled) return;
    const refreshVisibleData = () => {
      if (document.visibilityState === "visible") refreshRef.current();
    };
    const timer = window.setInterval(refreshVisibleData, LIVE_REFRESH_INTERVAL);
    window.addEventListener("focus", refreshVisibleData);
    document.addEventListener("visibilitychange", refreshVisibleData);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisibleData);
      document.removeEventListener("visibilitychange", refreshVisibleData);
    };
  }, [enabled]);
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [activeNav, setActiveNav] = useState("Visão geral");
  const [step, setStep] = useState(1);
  const [barber, setBarber] = useState("Thiago");
  const [day, setDay] = useState("30");
  const [time, setTime] = useState("10:00");
  const [notice, setNotice] = useState("");
  const [config, setConfig] = useState<BusinessConfig>(defaultConfig);
  const [signedIn, setSignedIn] = useState(false);
  const [isPlatformOwner, setIsPlatformOwner] = useState(false);
  const [tenantId, setTenantId] = useState("chosen");
  const [tenantName, setTenantName] = useState("Chosen Barbearia");
  const [tenantSlug, setTenantSlug] = useState("chosen");
  const [tenantBusinessType, setTenantBusinessType] = useState<"salon" | "barbershop">("barbershop");
  const [tenantPlan, setTenantPlan] = useState("starter");
  const [shareNotice, setShareNotice] = useState("");
  const [userName, setUserName] = useState("Administrador");
  const [masterRole, setMasterRole] = useState("Proprietário");
  const [accountRole, setAccountRole] = useState<"owner" | "staff" | "demo">("demo");
  const [permissions, setPermissions] = useState<PanelPermissions>(allPanelPermissions);
  const [saveNotice, setSaveNotice] = useState("");
  const [quickAction, setQuickAction] = useState<QuickAction | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then(async (user) => {
      const managedTenant = user?.tenantId || "chosen";
      const saved = await fetch(`/api/config?tenant=${encodeURIComponent(managedTenant)}`)
        .then((r) => r.ok ? r.json() : defaultConfig);
      setConfig(saved);
      setTenantId(managedTenant);
      if (user?.tenantName) setTenantName(user.tenantName);
      if (user?.tenantSlug) setTenantSlug(user.tenantSlug);
      if (user?.businessType) setTenantBusinessType(user.businessType);
      if (user?.plan) setTenantPlan(user.plan);
      if (user?.email) {
        setSignedIn(true);
        setIsPlatformOwner(Boolean(user.isOwner));
        setUserName(user.staffName || user.displayName || user.email);
        if (user.ownerRole) setMasterRole(user.ownerRole);
        setAccountRole(user.role === "staff" ? "staff" : "owner");
        setMustChangePassword(Boolean(user.mustChangePassword));
        if (user.permissions) setPermissions(user.permissions);
        const authenticatedView: View = user.isOwner ? "master" : "admin";
        if (window.localStorage.getItem("salonos:last-view") === authenticatedView) {
          const savedNav = window.localStorage.getItem(`salonos:last-nav:${authenticatedView}`);
          const allowedNav = authenticatedView === "master"
            ? masterNavItems
            : [...navItems, "Configurações"];
          if (savedNav && allowedNav.includes(savedNav)) setActiveNav(savedNav);
          setView(authenticatedView);
        }
        if (new URLSearchParams(window.location.search).get("emergency") === "1") {
          setView(user.isOwner ? "master" : "admin");
          window.history.replaceState({}, "", "/");
        }
      }
    }).catch(() => fetch("/api/config").then((r) => r.ok ? r.json() : defaultConfig).then(setConfig));
  }, []);

  useEffect(() => {
    if (view === "login" && signedIn) setView(isPlatformOwner ? "master" : "admin");
  }, [view, signedIn, isPlatformOwner]);

  useEffect(() => {
    if (!signedIn || (view !== "admin" && view !== "master")) return;
    window.localStorage.setItem("salonos:last-view", view);
    window.localStorage.setItem(`salonos:last-nav:${view}`, activeNav);
  }, [activeNav, signedIn, view]);

  async function saveConfig(next: BusinessConfig) {
    setSaveNotice("Salvando...");
    const response = await fetch(`/api/config?tenant=${encodeURIComponent(tenantId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    if (response.ok) {
      setConfig(next);
      setSaveNotice("Alterações salvas");
    } else if (response.status === 401) {
      window.location.assign("/signin-with-chatgpt?return_to=/");
    } else {
      const data = await response.json().catch(() => null) as { error?: string } | null;
      setSaveNotice(data?.error || "Não foi possível salvar");
    }
  }

  const title = useMemo(() => {
    if (view === "admin") return activeNav;
    if (view === "master") return activeNav === "Visão geral" ? "Painel Master" : activeNav;
    return "";
  }, [view, activeNav]);

  const visibleAdminNav = useMemo(() => navItems.filter((item) => {
    if (item === "Agenda") return permissions.agenda;
    if (item === "Clientes") return permissions.clients;
    if (item === "Financeiro") return permissions.finance && tenantPlan !== "starter";
    if (item === "Estoque") return permissions.settings && tenantPlan !== "starter";
    if (item === "Equipe") return permissions.settings;
    if (item === "Serviços") return permissions.settings;
    return true;
  }), [permissions, tenantPlan]);
  const tenantPlanLabel = tenantPlan === "premium" ? "Premium" : tenantPlan === "pro" ? "Pro" : "Starter";

  function go(next: View) {
    setView(next);
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function copyBookingLink() {
    const link = `${window.location.origin}/agendar/${tenantSlug}`;
    await navigator.clipboard.writeText(link);
    setShareNotice("Link copiado");
    window.setTimeout(() => setShareNotice(""), 1800);
  }

  function openQuickAction(action: QuickAction) {
    setQuickAction(action);
    setActiveNav(action === "client" ? "Clientes" : "Agenda");
  }

  async function confirmBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const payload = {
      tenant: "chosen",
      customerName: data.get("name"),
      phone: data.get("phone"),
      barber,
      service: "Corte",
      date: `2026-07-${day}`,
      time,
    };
    try {
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new Error();
      setStep(4);
    } catch {
      setNotice("Não foi possível salvar agora. Tente novamente em instantes.");
    }
  }

  if (view === "landing") {
    return (
      <main className="landing">
        <header className="topbar shell">
          <Logo />
          <nav className="desktop-nav" aria-label="Navegação principal">
            <a href="#recursos">Recursos</a>
            <a href="#como-funciona">Como funciona</a>
            <a href="#planos">Planos</a>
          </nav>
          <div className="header-actions">
            <button className="text-button" onClick={() => go("login")}>Entrar</button>
            <button className="gold-button compact" onClick={() => window.location.assign("/agendar")}>Agendar agora <span>↗</span></button>
          </div>
        </header>

        <section className="hero shell">
          <div className="eyebrow"><span className="pulse" /> Gestão inteligente para negócios de beleza</div>
          <h1>Menos gestão.<br /><em>Mais crescimento.</em></h1>
          <p>O sistema operacional do seu negócio. Agenda inteligente, gestão completa, financeiro e relacionamento com clientes em um só lugar.</p>
          <div className="hero-actions">
            <button className="gold-button" onClick={() => window.location.assign("/agendar")}>Encontrar estabelecimento <span>→</span></button>
            <button className="outline-button" onClick={() => go("admin")}><span className="play">▶</span> Ver demonstração</button>
          </div>
          <div className="trust"><span>✓ Teste grátis por 14 dias</span><span>✓ Sem cartão de crédito</span><span>✓ Cancele quando quiser</span></div>
        </section>

        <section className="product-stage shell" aria-label="Prévia do SalonOS">
          <div className="glow" />
          <div className="browser-frame">
            <div className="browser-head"><i /><i /><i /><span>app.salonos.com/painel</span></div>
            <DashboardContent mini />
          </div>
        </section>

        <section id="recursos" className="features shell">
          <div>
            <span className="section-kicker">TUDO CONECTADO</span>
            <h2>Gestão completa.<br /><em>Sem complicação.</em></h2>
          </div>
          <div className="feature-grid">
            {[
              ["01", "Agenda inteligente", "Horários organizados, bloqueios automáticos e visão completa da equipe."],
              ["02", "Clientes no centro", "Histórico, preferências e frequência de cada cliente em um só perfil."],
              ["03", "Números claros", "Faturamento, desempenho e comissões para decidir com segurança."],
            ].map(([n, t, d]) => <article key={n}><b>{n}</b><h3>{t}</h3><p>{d}</p></article>)}
          </div>
        </section>

        <section id="como-funciona" className="network-showcase shell">
          <div className="network-heading"><span className="section-kicker">UMA PLATAFORMA, VÁRIAS IDENTIDADES</span><h2>Feito para cada estilo<br />de <em>negócio.</em></h2><p>Salões e barbearias com sua própria marca, operação e página de agendamento.</p></div>
          <div className="network-brands">
            {[
              ["BV", "Barbearia Vértice", "Balneário Camboriú · SC", "vertex"],
              ["MA", "Maison Aurora", "Florianópolis · SC", "aurora"],
              ["ON", "Old North Barber", "Itajaí · SC", "north"],
              ["BL", "Bella Luna Studio", "Joinville · SC", "bella"],
            ].map(([mark, name, city, style]) => <article className="network-brand" key={name}>
              <span className={`network-logo ${style}`}>{mark}</span>
              <span><strong>{name}</strong><small>{city}</small></span>
              <i>SalonOS</i>
            </article>)}
          </div>
        </section>
        <Footer />
      </main>
    );
  }

  if (view === "login") {
    return <SalonLogin onBack={() => go("landing")} onSuccess={async (user) => {
      const managedTenant = user.tenantId || "chosen";
      setSignedIn(true);
      setIsPlatformOwner(Boolean(user.isOwner));
      setUserName(user.staffName || user.displayName || user.email);
      if (user.ownerRole) setMasterRole(user.ownerRole);
      setAccountRole(user.role === "staff" ? "staff" : "owner");
      setMustChangePassword(Boolean(user.mustChangePassword));
      setTenantId(managedTenant);
      if (user.tenantName) setTenantName(user.tenantName);
      if (user.tenantSlug) setTenantSlug(user.tenantSlug);
      if (user.businessType) setTenantBusinessType(user.businessType);
      if (user.plan) setTenantPlan(user.plan);
      if (user.permissions) setPermissions(user.permissions);
      const saved = await fetch(`/api/config?tenant=${encodeURIComponent(managedTenant)}`)
        .then((response) => response.ok ? response.json() : defaultConfig);
      setConfig(saved);
      go(user.isOwner ? "master" : "admin");
    }} />;
  }

  if (view === "booking") {
    return <BookingFlow config={config} onBack={() => go("landing")} />;
    /*
    return (
      <main className="booking-page">
        <header className="booking-header"><button className="back-button inline" onClick={() => go("landing")}>← Voltar</button><div className="chosen-brand"><span className="chosen-mark">C</span><span><strong>CHOSEN</strong><small>BARBEARIA</small></span></div><span className="location">Camboriú · SC</span></header>
        <section className="booking-wrap">
          {step < 4 && <div className="steps">{["Serviço", "Profissional", "Horário"].map((label, i) => <span className={step >= i + 1 ? "active" : ""} key={label}><b>{i + 1}</b>{label}</span>)}</div>}
          {step === 1 && <div className="booking-panel"><span className="section-kicker">PASSO 1 DE 3</span><h1>O que você deseja?</h1><p>Escolha o serviço para continuar.</p><button className="service-choice selected" onClick={() => setStep(2)}><span className="scissors">✦</span><span><strong>Corte</strong><small>Atendimento completo · 50 min</small></span><b>R$ 50</b><i>→</i></button></div>}
          {step === 2 && <div className="booking-panel"><span className="section-kicker">PASSO 2 DE 3</span><h1>Com quem você prefere?</h1><p>Escolha um profissional disponível.</p><div className="barber-grid">{["Thiago", "Dav"].map((name, i) => <button key={name} onClick={() => setBarber(name)} className={`barber-choice ${barber === name ? "selected" : ""}`}><span className="avatar">{name[0]}</span><strong>{name}</strong><small>Barbeiro</small><i>{barber === name ? "✓" : ""}</i></button>)}</div><button className="gold-button full" onClick={() => setStep(3)}>Continuar →</button></div>}
          {step === 3 && <form className="booking-panel wide" onSubmit={confirmBooking}><span className="section-kicker">PASSO 3 DE 3</span><h1>Escolha o melhor horário</h1><p>Julho de 2026 · horários disponíveis com {barber}.</p><div className="date-strip">{["29", "30", "31", "01"].map((d, i) => <button type="button" key={d} onClick={() => setDay(d)} className={day === d ? "selected" : ""}><small>{["QUA", "QUI", "SEX", "SÁB"][i]}</small><strong>{d}</strong></button>)}</div><div className="time-grid">{["10:00", "11:00", "13:00", "14:00", "15:30", "17:00", "18:00", "19:00"].map(t => <button type="button" key={t} onClick={() => setTime(t)} className={time === t ? "selected" : ""}>{t}</button>)}</div><div className="customer-fields"><label>Seu nome<input name="name" placeholder="Nome completo" required /></label><label>WhatsApp<input name="phone" placeholder="(47) 9 9999-9999" required /></label></div>{notice && <p className="error">{notice}</p>}<button className="gold-button full" type="submit">Confirmar agendamento →</button></form>}
          {step === 4 && <div className="booking-panel success-panel"><span className="success-icon">✓</span><span className="section-kicker">HORÁRIO RESERVADO</span><h1>Agendamento confirmado!</h1><p>Seu corte com {barber} está marcado para o dia {day}/07 às {time}.</p><div className="booking-summary"><span><small>Serviço</small><strong>Corte · R$ 50</strong></span><span><small>Local</small><strong>Chosen · Camboriú</strong></span></div><button className="outline-button full" onClick={() => { setStep(1); go("landing"); }}>Voltar ao início</button></div>}
        </section>
      </main>
    );
    */
  }

  return (<>
    <main className={`app-shell ${view === "admin" && tenantBusinessType === "salon" ? "manager-white" : ""}`}>
      <aside className="sidebar">
        <Logo />
        <div className="workspace">{view === "master" ? <span className="workspace-icon">S</span> : <TenantWorkspaceMark tenantId={tenantId} tenantName={tenantName} />}<span><strong>{view === "master" ? "SalonOS Master" : tenantName}</strong><small>{view === "master" ? masterRole : `${accountRole === "staff" ? "Acesso da equipe" : "Gestão da unidade"} · Plano ${tenantPlanLabel}`}</small></span><b>⌄</b></div>
        <nav>{(view === "master" ? masterNavItems : visibleAdminNav).map((item, i) => {
          const iconIndex = view === "master" ? i : navItems.indexOf(item);
          const NavIcon = (view === "master" ? masterNavIcons : adminNavIcons)[iconIndex];
          return <button key={item} className={activeNav === item || (i === 0 && !activeNav) ? "active" : ""} onClick={() => { setQuickAction(null); setActiveNav(item); }}><span><NavIcon aria-hidden="true" /></span>{item}</button>;
        })}</nav>
        <div className="sidebar-bottom">{permissions.settings && <button className={activeNav === "Configurações" ? "active" : ""} onClick={() => { setQuickAction(null); setActiveNav("Configurações"); }}><Settings aria-hidden="true" /> Configurações</button>}<div className="user-chip"><span>{userName.slice(0, 2).toUpperCase()}</span><div><strong>{userName}</strong><small>{signedIn ? view === "master" ? masterRole : accountRole === "staff" ? "Acesso individual" : "Sessão protegida" : "Demonstração"}</small></div><button aria-label={signedIn ? "Sair" : "Entrar"} onClick={() => window.location.assign(signedIn ? "/api/auth/logout" : "/")}>{signedIn ? <LogOut aria-hidden="true" /> : <LogIn aria-hidden="true" />}</button></div></div>
      </aside>
      <section className="app-main">
        <header className="app-header"><div><span className="mobile-label">SalonOS</span><h1>{title}</h1><p>{view === "master" ? "Acompanhe toda a operação da plataforma." : (shareNotice || (accountRole === "staff" ? "Acesso conforme suas permissões" : "Gestão da sua barbearia"))}</p></div><div className="header-tools"><button className="icon-button" aria-label="Buscar"><Search aria-hidden="true" /></button><button className="icon-button" aria-label="Notificações"><Bell aria-hidden="true" /></button>{view === "admin" && <button className="outline-button compact" onClick={copyBookingLink}><Link2 aria-hidden="true" /> Copiar link</button>}{view === "admin" && permissions.agenda && <button className="gold-button compact" onClick={() => openQuickAction("appointment")}><CalendarRange aria-hidden="true" /> Novo agendamento</button>}</div></header>
        {view === "master" ? <MasterContent section={activeNav} onNavigate={setActiveNav} /> : activeNav === "Agenda"
          ? <AgendaContent tenantId={tenantId} config={config} quickAction={quickAction} onActionHandled={() => setQuickAction(null)} />
          : activeNav === "Clientes"
          ? <ClientsContent tenantId={tenantId} quickAction={quickAction} onActionHandled={() => setQuickAction(null)} />
          : activeNav === "Financeiro"
          ? <FinanceContent tenantId={tenantId} />
          : activeNav === "Estoque"
          ? <InventoryContent tenantId={tenantId} />
          : activeNav === "Serviços" || activeNav === "Equipe" || activeNav === "Configurações"
          ? <ConfigContent config={config} section={activeNav} onSave={saveConfig} notice={saveNotice} signedIn={signedIn} tenantId={tenantId} tenantName={tenantName} tenantPlan={tenantPlan} />
          : <DashboardContent config={config} tenantId={tenantId} tenantSlug={tenantSlug} tenantName={tenantName} permissions={permissions} onNavigate={setActiveNav} onQuickAction={openQuickAction} />}
      </section>
    </main>
    {view === "admin" && mustChangePassword && <PasswordChangeGate onChanged={() => setMustChangePassword(false)} />}
  </>);
}

function BookingFlow({ config, onBack }: { config: BusinessConfig; onBack: () => void }) {
  const services = config.services.filter((item) => item.active);
  const barbers = config.barbers.filter((item) => item.active);
  const [step, setStep] = useState(1);
  const [serviceName, setServiceName] = useState(services[0]?.name || "");
  const [barber, setBarber] = useState(barbers[0]?.name || "");
  const [selectedDate, setSelectedDate] = useState("");
  const [time, setTime] = useState("");
  const [bookedTimes, setBookedTimes] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedService = services.find((item) => item.name === serviceName) || services[0];
  const availableDates = useMemo(() => {
    const result: Date[] = [];
    const cursor = new Date();
    cursor.setHours(12, 0, 0, 0);
    for (let offset = 0; offset < 21 && result.length < 5; offset += 1) {
      const candidate = new Date(cursor);
      candidate.setDate(cursor.getDate() + offset);
      const openToday = config.hours.some((hours) =>
        hours.active && hours.days.split(",").includes(String(candidate.getDay())),
      );
      if (openToday) result.push(candidate);
    }
    return result;
  }, [config.hours]);

  useEffect(() => {
    if (!serviceName && services[0]) setServiceName(services[0].name);
    if (!barber && barbers[0]) setBarber(barbers[0].name);
  }, [barber, barbers, serviceName, services]);

  useEffect(() => {
    if (!selectedDate && availableDates[0]) setSelectedDate(toLocalISODate(availableDates[0]));
  }, [availableDates, selectedDate]);

  useEffect(() => {
    if (step !== 3 || !selectedDate || !barber) return;
    setTime("");
    fetch(`/api/appointments?availability=1&date=${encodeURIComponent(selectedDate)}&barber=${encodeURIComponent(barber)}`)
      .then((response) => response.ok ? response.json() : { booked: [] })
      .then((data) => setBookedTimes(data.booked || []))
      .catch(() => setBookedTimes([]));
  }, [barber, selectedDate, step]);

  const slots = useMemo(() => {
    if (!selectedDate || !selectedService) return [];
    const selected = new Date(`${selectedDate}T12:00:00`);
    const hours = config.hours.find((item) =>
      item.active && item.days.split(",").includes(String(selected.getDay())),
    );
    if (!hours) return [];
    return createTimeSlots(hours.open, hours.close, selectedService.duration)
      .filter((slot) => {
        const now = new Date();
        const [slotHour, slotMinute] = slot.split(":").map(Number);
        const alreadyPassed = selectedDate === toLocalISODate(now)
          && slotHour * 60 + slotMinute <= now.getHours() * 60 + now.getMinutes();
        return !bookedTimes.includes(slot) && !alreadyPassed;
      });
  }, [bookedTimes, config.hours, selectedDate, selectedService]);

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService || !barber || !selectedDate || !time) {
      setNotice("Escolha um horário disponível para continuar.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSubmitting(true);
    setNotice("");
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerName: form.get("name"),
        phone: form.get("phone"),
        barber,
        service: selectedService.name,
        date: selectedDate,
        time,
      }),
    });
    setSubmitting(false);
    if (response.ok) {
      setStep(4);
      return;
    }
    const data = await response.json().catch(() => null);
    setNotice(data?.error || "Não foi possível concluir o agendamento.");
    if (response.status === 409) setBookedTimes((current) => [...current, time]);
  }

  return <main className="booking-page">
    <header className="booking-header">
      <button className="back-button inline" onClick={onBack}>← Voltar</button>
      <div className="chosen-brand"><span className="chosen-mark">C</span><span><strong>CHOSEN</strong><small>BARBEARIA</small></span></div>
      <span className="location">Camboriú · SC</span>
    </header>
    <section className="booking-wrap">
      {step < 4 && <div className="steps">{["Serviço", "Profissional", "Horário"].map((label, index) =>
        <span className={step >= index + 1 ? "active" : ""} key={label}><b>{index + 1}</b>{label}</span>)}</div>}

      {step === 1 && <div className="booking-panel">
        <span className="section-kicker">PASSO 1 DE 3</span><h1>O que você deseja?</h1><p>Escolha o serviço para continuar.</p>
        <div className="booking-options">{services.map((service) =>
          <button key={service.name} className={`service-choice ${serviceName === service.name ? "selected" : ""}`} onClick={() => setServiceName(service.name)}>
            <span className="scissors">✦</span><span><strong>{service.name}</strong><small>Atendimento · {service.duration} min</small></span><b>R$ {service.price}</b><i>→</i>
          </button>)}</div>
        {!services.length && <p className="empty-message">Nenhum serviço está disponível no momento.</p>}
        <button className="gold-button full" disabled={!selectedService} onClick={() => setStep(2)}>Continuar →</button>
      </div>}

      {step === 2 && <div className="booking-panel">
        <span className="section-kicker">PASSO 2 DE 3</span><h1>Com quem você prefere?</h1><p>Escolha um profissional disponível.</p>
        <div className="barber-grid">{barbers.map((name) =>
          <button key={name.name} onClick={() => setBarber(name.name)} className={`barber-choice ${barber === name.name ? "selected" : ""}`}>
            <span className="avatar">{name.name[0]}</span><strong>{name.name}</strong><small>Profissional</small><i>{barber === name.name ? "✓" : ""}</i>
          </button>)}</div>
        {!barbers.length && <p className="empty-message">Nenhum profissional está disponível no momento.</p>}
        <button className="gold-button full" disabled={!barber} onClick={() => setStep(3)}>Continuar →</button>
      </div>}

      {step === 3 && <form className="booking-panel wide" onSubmit={submitBooking}>
        <span className="section-kicker">PASSO 3 DE 3</span><h1>Escolha o melhor horário</h1><p>Horários disponíveis com {barber}.</p>
        <div className="date-strip">{availableDates.map((date) => {
          const iso = toLocalISODate(date);
          return <button type="button" key={iso} onClick={() => setSelectedDate(iso)} className={selectedDate === iso ? "selected" : ""}>
            <small>{date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase()}</small><strong>{date.getDate()}</strong>
          </button>;
        })}</div>
        <div className="time-grid">{slots.map((slot) =>
          <button type="button" key={slot} onClick={() => setTime(slot)} className={time === slot ? "selected" : ""}>{slot}</button>)}</div>
        {!slots.length && <p className="empty-message">Não há horários livres nesta data. Escolha outro dia.</p>}
        <div className="customer-fields"><label>Seu nome<input name="name" placeholder="Nome completo" required minLength={3} /></label><label>WhatsApp<input name="phone" placeholder="(47) 9 9999-9999" required minLength={8} /></label></div>
        {notice && <p className="error">{notice}</p>}
        <button className="gold-button full" type="submit" disabled={!time || submitting}>{submitting ? "Reservando..." : "Confirmar agendamento →"}</button>
      </form>}

      {step === 4 && <div className="booking-panel success-panel">
        <span className="success-icon">✓</span><span className="section-kicker">HORÁRIO RESERVADO</span><h1>Agendamento confirmado!</h1>
        <p>Seu atendimento com {barber} está marcado para {formatBookingDate(selectedDate)} às {time}.</p>
        <div className="booking-summary"><span><small>Serviço</small><strong>{selectedService?.name} · R$ {selectedService?.price}</strong></span><span><small>Local</small><strong>Chosen · Camboriú</strong></span></div>
        <button className="outline-button full" onClick={onBack}>Voltar ao início</button>
      </div>}
    </section>
  </main>;
}

function toLocalISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createTimeSlots(open: string, close: string, duration: number) {
  const [openHour, openMinute] = open.split(":").map(Number);
  const [closeHour, closeMinute] = close.split(":").map(Number);
  const start = openHour * 60 + openMinute;
  const end = closeHour * 60 + closeMinute;
  const interval = Math.max(15, duration || 30);
  const slots: string[] = [];
  for (let minute = start; minute + interval <= end; minute += interval) {
    slots.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  }
  return slots;
}

function formatBookingDate(value: string) {
  if (!value) return "";
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ConfigContent({ config, section, onSave, notice, signedIn, tenantId, tenantName, tenantPlan }: {
  config: BusinessConfig;
  section: string;
  onSave: (next: BusinessConfig) => Promise<void>;
  notice: string;
  signedIn: boolean;
  tenantId: string;
  tenantName: string;
  tenantPlan: string;
}) {
  const [draft, setDraft] = useState(config);
  const [photoNotice, setPhotoNotice] = useState("");
  const [accessNotice, setAccessNotice] = useState("");
  const professionalLimit = tenantPlan === "starter" ? 1 : tenantPlan === "pro" ? 5 : Number.POSITIVE_INFINITY;
  const reachedProfessionalLimit = draft.barbers.length >= professionalLimit;
  useEffect(() => setDraft(config), [config]);

  const updateService = (index: number, field: string, value: string | number | boolean) => {
    const services = draft.services.map((item, i) => i === index ? { ...item, [field]: value } : item);
    setDraft({ ...draft, services });
  };
  const updateBarber = (index: number, field: string, value: unknown) => {
    const barbers = draft.barbers.map((item, i) => i === index ? { ...item, [field]: value } : item);
    setDraft({ ...draft, barbers });
  };
  const updateBarberEmail = (index: number, email: string) => {
    const barbers = draft.barbers.map((item, i) => i === index ? {
      ...item,
      email,
      accessEnabled: item.email === email ? item.accessEnabled : false,
      accessMustChange: item.email === email ? item.accessMustChange : false,
    } : item);
    setDraft({ ...draft, barbers });
  };
  const toggleBarberList = (index: number, field: "services" | "workDays", value: string) => {
    const barbers = draft.barbers.map((item, i) => {
      if (i !== index) return item;
      const current = item[field] || [];
      return { ...item, [field]: current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value] };
    });
    setDraft({ ...draft, barbers });
  };
  const updatePermission = (index: number, permission: "agenda" | "clients" | "finance" | "settings", value: boolean) => {
    const barbers = draft.barbers.map((item, i) => i === index ? { ...item, permissions: { ...item.permissions, [permission]: value } } : item);
    setDraft({ ...draft, barbers });
  };
  const updateTimeOff = (index: number, timeOffIndex: number, field: "start" | "end" | "label", value: string) => {
    const barbers = draft.barbers.map((item, i) => i === index ? {
      ...item,
      timeOff: (item.timeOff || []).map((period, periodIndex) => periodIndex === timeOffIndex ? { ...period, [field]: value } : period),
    } : item);
    setDraft({ ...draft, barbers });
  };
  const updateHours = (index: number, field: string, value: string | boolean) => {
    const hours = draft.hours.map((item, i) => i === index ? { ...item, [field]: value } : item);
    setDraft({ ...draft, hours });
  };
  const barberPhotoUrl = (photoKey: string) => `/api/barber-photo?tenant=${encodeURIComponent(tenantId)}&key=${encodeURIComponent(photoKey)}`;

  async function uploadBarberPhoto(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setPhotoNotice(`Enviando foto de ${draft.barbers[index].name}...`);
    const form = new FormData();
    form.set("photo", file);
    if (draft.barbers[index].photoKey) form.set("currentKey", draft.barbers[index].photoKey || "");
    const response = await fetch(`/api/barber-photo?tenant=${encodeURIComponent(tenantId)}`, { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setPhotoNotice(data?.error || "Não foi possível enviar a foto.");
      event.target.value = "";
      return;
    }
    updateBarber(index, "photoKey", data.photoKey);
    setPhotoNotice("Foto atualizada. Salve as alterações para confirmar.");
    event.target.value = "";
  }

  async function removeBarberPhoto(index: number) {
    const photoKey = draft.barbers[index].photoKey;
    if (!photoKey) return;
    const response = await fetch(`/api/barber-photo?tenant=${encodeURIComponent(tenantId)}&key=${encodeURIComponent(photoKey)}`, { method: "DELETE" });
    if (!response.ok) {
      setPhotoNotice("Não foi possível remover a foto.");
      return;
    }
    updateBarber(index, "photoKey", null);
    setPhotoNotice("Foto removida.");
  }

  async function createStaffAccess(index: number) {
    const professional = draft.barbers[index];
    if (!professional.email) {
      setAccessNotice("Informe e salve o e-mail do profissional primeiro.");
      return;
    }
    setAccessNotice(`Criando acesso de ${professional.name}...`);
    const response = await fetch("/api/auth/manage-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant: tenantId, email: professional.email }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setAccessNotice(data?.error || "Não foi possível criar o acesso.");
      return;
    }
    const barbers = draft.barbers.map((item, i) => i === index ? { ...item, accessEnabled: true, accessMustChange: true } : item);
    setDraft({ ...draft, barbers });
    setAccessNotice(`Acesso liberado para ${professional.email}. Senha provisória única: ${data.temporaryPassword}`);
  }

  async function revokeStaffAccess(index: number) {
    const professional = draft.barbers[index];
    const response = await fetch("/api/auth/manage-user", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant: tenantId, email: professional.email }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setAccessNotice(data?.error || "Não foi possível bloquear o acesso.");
      return;
    }
    const barbers = draft.barbers.map((item, i) => i === index ? { ...item, accessEnabled: false, accessMustChange: false } : item);
    setDraft({ ...draft, barbers });
    setAccessNotice(`Acesso de ${professional.name} bloqueado imediatamente.`);
  }

  return <div className="settings-page">
    <div className="settings-intro">
      <div><span className="section-kicker">CHOSEN BARBEARIA</span><h2>{section === "Equipe" ? "Profissionais" : section === "Serviços" ? "Serviços e preços" : "Funcionamento"}</h2><p>As alterações ficam salvas e serão usadas na agenda e no agendamento dos clientes.</p></div>
      {!signedIn && <a className="outline-button" href="/signin-with-chatgpt?return_to=/">Entrar para editar</a>}
    </div>

    {section === "Serviços" && <section className="panel config-panel">
      <div className="config-head"><span>SERVIÇO</span><span>PREÇO</span><span>DURAÇÃO</span><span>ATIVO</span></div>
      {draft.services.map((service, index) => <div className="config-row" key={`${service.name}-${index}`}>
        <input aria-label="Nome do serviço" value={service.name} onChange={(e) => updateService(index, "name", e.target.value)} />
        <label className="money-input"><span>R$</span><input aria-label="Preço" type="number" value={service.price} onChange={(e) => updateService(index, "price", Number(e.target.value))} /></label>
        <label className="money-input"><input aria-label="Duração" type="number" value={service.duration} onChange={(e) => updateService(index, "duration", Number(e.target.value))} /><span>min</span></label>
        <button className={`switch ${service.active ? "on" : ""}`} aria-label="Ativar serviço" onClick={() => updateService(index, "active", !service.active)}><i /></button>
      </div>)}
      <button className="add-row" onClick={() => setDraft({ ...draft, services: [...draft.services, { name: "Novo serviço", price: 0, duration: 30, active: true }] })}>+ Adicionar serviço</button>
    </section>}

    {section === "Equipe" && <section className="team-config">
      <div className="team-summary">
        <span><UsersRound aria-hidden="true" /><small>PROFISSIONAIS</small><strong>{draft.barbers.length}</strong></span>
        <span><UserRound aria-hidden="true" /><small>ATIVOS</small><strong>{draft.barbers.filter((item) => item.active).length}</strong></span>
        <span><ShieldCheck aria-hidden="true" /><small>COM ACESSO</small><strong>{draft.barbers.filter((item) => item.accessEnabled).length}</strong></span>
      </div>
      <p className="commercial-note">Limite do plano: {Number.isFinite(professionalLimit) ? `${professionalLimit} ${professionalLimit === 1 ? "profissional" : "profissionais"}` : "profissionais ilimitados"}.</p>
      {photoNotice && <p className="agenda-page-notice">{photoNotice}</p>}
      {accessNotice && <p className="agenda-page-notice">{accessNotice}</p>}
      <div className="team-list">
        {draft.barbers.map((barber, index) => <article className="panel professional-card" key={`${barber.name}-${index}`}>
          <header>
            <span className="professional-avatar">{barber.photoKey ? <img src={barberPhotoUrl(barber.photoKey)} alt={`Foto de ${barber.name}`} /> : barber.name[0] || "P"}</span>
            <span><strong>{barber.name || "Novo profissional"}</strong><small>{barber.role || "Profissional"} · {barber.active ? "Ativo na agenda" : "Inativo"}</small></span>
            <span className="professional-photo-actions"><label>{barber.photoKey ? "Trocar foto" : "Adicionar foto"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadBarberPhoto(index, event)} /></label>{barber.photoKey && <button type="button" onClick={() => removeBarberPhoto(index)}>Remover</button>}</span>
            <button type="button" className={`switch ${barber.active ? "on" : ""}`} aria-label="Ativar profissional" onClick={() => updateBarber(index, "active", !barber.active)}><i /></button>
          </header>
          <div className="professional-fields">
            <label>Nome completo<input value={barber.name} onChange={(e) => updateBarber(index, "name", e.target.value)} /></label>
            <label>Função<select value={barber.role || "Barbeiro"} onChange={(e) => updateBarber(index, "role", e.target.value)}><option>Barbeiro</option><option>Recepcionista</option><option>Gerente</option></select></label>
            <label>E-mail de acesso<input type="email" placeholder="profissional@email.com" value={barber.email || ""} onChange={(e) => updateBarberEmail(index, e.target.value)} /></label>
            <label>WhatsApp<input placeholder="(00) 0 0000-0000" value={barber.phone || ""} onChange={(e) => updateBarber(index, "phone", e.target.value)} /></label>
            <label>Comissão<label className="money-input"><input type="number" min="0" max="100" value={barber.commission} onChange={(e) => updateBarber(index, "commission", Number(e.target.value))} /><span>%</span></label></label>
          </div>
          <div className="professional-section"><span><Scissors aria-hidden="true" /> SERVIÇOS ATENDIDOS</span><div className="choice-chips">{draft.services.map((service) => <button type="button" className={(barber.services || []).includes(service.name) ? "selected" : ""} onClick={() => toggleBarberList(index, "services", service.name)} key={service.name}>{service.name}</button>)}</div></div>
          <div className="professional-section"><span><CalendarDays aria-hidden="true" /> DIAS DE TRABALHO</span><div className="choice-chips days">{[["1","SEG"],["2","TER"],["3","QUA"],["4","QUI"],["5","SEX"],["6","SÁB"],["0","DOM"]].map(([value, label]) => <button type="button" className={(barber.workDays || []).includes(value) ? "selected" : ""} onClick={() => toggleBarberList(index, "workDays", value)} key={value}>{label}</button>)}</div></div>
          <div className="professional-section"><span><Clock3 aria-hidden="true" /> EXPEDIENTE INDIVIDUAL</span><div className="schedule-fields"><label>Entrada<input type="time" value={barber.workStart || "09:00"} onChange={(e) => updateBarber(index, "workStart", e.target.value)} /></label><label>Saída<input type="time" value={barber.workEnd || "18:00"} onChange={(e) => updateBarber(index, "workEnd", e.target.value)} /></label><label>Início da pausa<input type="time" value={barber.breakStart || ""} onChange={(e) => updateBarber(index, "breakStart", e.target.value)} /></label><label>Fim da pausa<input type="time" value={barber.breakEnd || ""} onChange={(e) => updateBarber(index, "breakEnd", e.target.value)} /></label></div></div>
          <div className="professional-section"><span><CalendarRange aria-hidden="true" /> FOLGAS E FÉRIAS</span><div className="timeoff-list">{(barber.timeOff || []).map((period, periodIndex) => <div className="timeoff-row" key={`${period.start}-${periodIndex}`}><input aria-label="Motivo" placeholder="Férias ou folga" value={period.label} onChange={(e) => updateTimeOff(index, periodIndex, "label", e.target.value)} /><input aria-label="Início" type="date" value={period.start} onChange={(e) => updateTimeOff(index, periodIndex, "start", e.target.value)} /><input aria-label="Fim" type="date" value={period.end} onChange={(e) => updateTimeOff(index, periodIndex, "end", e.target.value)} /><button type="button" onClick={() => updateBarber(index, "timeOff", (barber.timeOff || []).filter((_, i) => i !== periodIndex))}>Remover</button></div>)}</div><button type="button" className="inline-add" onClick={() => updateBarber(index, "timeOff", [...(barber.timeOff || []), { start: "", end: "", label: "Folga" }])}>+ Adicionar período</button></div>
          <div className="professional-section"><span><ShieldCheck aria-hidden="true" /> PERMISSÕES NO PAINEL</span><div className="permission-grid">{[
            ["agenda", "Agenda"],
            ["clients", "Clientes"],
            ["finance", "Financeiro"],
            ["settings", "Configurações"],
          ].map(([permission, label]) => <label key={permission}><input type="checkbox" checked={Boolean(barber.permissions?.[permission as keyof typeof barber.permissions])} onChange={(e) => updatePermission(index, permission as "agenda" | "clients" | "finance" | "settings", e.target.checked)} /><span>{label}</span></label>)}</div><div className="staff-access-control"><span><strong>{barber.accessEnabled ? "Acesso individual ativo" : "Acesso ainda não criado"}</strong><small>{barber.accessEnabled ? barber.accessMustChange ? "Aguardando troca da senha provisória" : "Senha pessoal configurada" : "Salve o e-mail e libere o acesso quando estiver pronto."}</small></span><button type="button" className="outline-button" disabled={!barber.email} onClick={() => createStaffAccess(index)}>{barber.accessEnabled ? "Redefinir senha" : "Liberar acesso"}</button>{barber.accessEnabled && <button type="button" className="danger-button" onClick={() => revokeStaffAccess(index)}>Bloquear acesso</button>}</div><small className="permission-note">{barber.email ? "Uma senha provisória única será exibida ao liberar o acesso. A troca será obrigatória no primeiro login." : "Informe um e-mail para preparar o acesso individual."}</small></div>
        </article>)}
      </div>
      <button className="add-row team-add" disabled={reachedProfessionalLimit} onClick={() => setDraft({ ...draft, barbers: [...draft.barbers, { name: "Novo profissional", email: "", phone: "", photoKey: null, accessEnabled: false, accessMustChange: false, role: "Barbeiro", commission: 30, services: draft.services.filter((item) => item.active).map((item) => item.name), workDays: ["2", "3", "4", "5", "6"], workStart: "09:00", workEnd: "18:00", breakStart: "12:00", breakEnd: "13:00", timeOff: [], permissions: { agenda: true, clients: false, finance: false, settings: false }, active: true }] })}>{reachedProfessionalLimit ? "Limite do plano atingido" : "+ Adicionar profissional"}</button>
    </section>}

    {section === "Configurações" && <><LogoManager tenantId={tenantId} tenantName={tenantName} signedIn={signedIn} /><section className="panel config-panel hours-panel">
      <div className="config-head hours-head"><span>PERÍODO</span><span>ABERTURA</span><span>FECHAMENTO</span><span>ATIVO</span></div>
      {draft.hours.map((hours, index) => <div className="config-row" key={hours.label}>
        <input aria-label="Período" value={hours.label} onChange={(e) => updateHours(index, "label", e.target.value)} />
        <input aria-label="Abertura" type="time" value={hours.open} onChange={(e) => updateHours(index, "open", e.target.value)} />
        <input aria-label="Fechamento" type="time" value={hours.close} onChange={(e) => updateHours(index, "close", e.target.value)} />
        <button className={`switch ${hours.active ? "on" : ""}`} aria-label="Ativar período" onClick={() => updateHours(index, "active", !hours.active)}><i /></button>
      </div>)}
      <div className="business-summary"><span><small>LOCALIZAÇÃO</small><strong>Camboriú · SC</strong></span><span><small>WHATSAPP</small><strong>(47) 9 9927-0340</strong></span></div>
    </section></>}
    <div className="save-bar"><span>{notice}</span><button className="gold-button" onClick={() => onSave(draft)}>{signedIn ? "Salvar alterações" : "Entrar e salvar"} →</button></div>
  </div>;
}

function TenantWorkspaceMark({ tenantId, tenantName }: { tenantId: string; tenantName: string }) {
  const [hasLogo, setHasLogo] = useState(true);
  const [version, setVersion] = useState(Date.now());

  useEffect(() => {
    const refreshLogo = () => {
      setHasLogo(true);
      setVersion(Date.now());
    };
    window.addEventListener("salonos:logo-updated", refreshLogo);
    return () => window.removeEventListener("salonos:logo-updated", refreshLogo);
  }, []);

  return <span className="workspace-icon workspace-logo">{hasLogo
    ? <img src={`/api/tenant-logo?tenant=${encodeURIComponent(tenantId)}&v=${version}`} alt={`Logo ${tenantName}`} onError={() => setHasLogo(false)} />
    : tenantName[0]}</span>;
}

function LogoManager({ tenantId, tenantName, signedIn }: { tenantId: string; tenantName: string; signedIn: boolean }) {
  const [logoVersion, setLogoVersion] = useState(Date.now());
  const [notice, setNotice] = useState("");
  const logoUrl = `/api/tenant-logo?tenant=${encodeURIComponent(tenantId)}&v=${logoVersion}`;

  async function uploadLogo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signedIn) {
      window.location.assign("/signin-with-chatgpt?return_to=/");
      return;
    }
    const form = new FormData(event.currentTarget);
    const file = form.get("logo");
    if (!(file instanceof File) || !file.size) {
      setNotice("Selecione uma imagem.");
      return;
    }
    setNotice("Enviando logo...");
    const response = await fetch(`/api/tenant-logo?tenant=${encodeURIComponent(tenantId)}`, {
      method: "POST",
      body: form,
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(data?.error || "Não foi possível salvar a logo.");
      return;
    }
    setLogoVersion(Date.now());
    setNotice("Logo atualizada.");
    window.dispatchEvent(new Event("salonos:logo-updated"));
    event.currentTarget.reset();
  }

  async function removeLogo() {
    const response = await fetch(`/api/tenant-logo?tenant=${encodeURIComponent(tenantId)}`, { method: "DELETE" });
    setNotice(response.ok ? "Logo removida." : "Não foi possível remover a logo.");
    setLogoVersion(Date.now());
    window.dispatchEvent(new Event("salonos:logo-updated"));
  }

  return <section className="panel brand-panel">
    <div className="brand-preview"><img src={logoUrl} alt={`Logo ${tenantName}`} onError={(event) => { event.currentTarget.style.display = "none"; }} /><span>{tenantName[0]}</span></div>
    <div><span className="section-kicker">IDENTIDADE VISUAL</span><h3>Logo da barbearia</h3><p>PNG, JPG ou WebP com até 2 MB. Ela aparecerá na página pública de agendamento.</p></div>
    <form onSubmit={uploadLogo}><input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /><button className="gold-button compact" type="submit">Enviar logo</button><button className="outline-button" type="button" onClick={removeLogo}>Remover</button><small>{notice}</small></form>
  </section>;
}

function Logo() {
  return <button className="logo" onClick={() => window.location.assign("/")} aria-label="SalonOS início"><img src="/salonos-logo.png" alt="SalonOS" /></button>;
}

function PasswordChangeGate({ onChanged }: { onChanged: () => void }) {
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: form.get("password"), confirmation: form.get("confirmation") }),
    });
    const data = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setNotice(data?.error || "Não foi possível alterar a senha.");
      return;
    }
    onChanged();
  }

  return <div className="appointment-overlay password-change-overlay" role="dialog" aria-modal="true" aria-label="Trocar senha provisória"><form className="auth-card password-change-card" onSubmit={changePassword}>
    <ShieldCheck aria-hidden="true" />
    <span className="section-kicker">PRIMEIRO ACESSO</span>
    <h2>Crie sua senha pessoal</h2>
    <p>A senha provisória recebida só pode ser usada no primeiro acesso.</p>
    <label>Nova senha<input name="password" type="password" minLength={8} required autoFocus autoComplete="new-password" /></label>
    <label>Confirmar nova senha<input name="confirmation" type="password" minLength={8} required autoComplete="new-password" /></label>
    {notice && <p className="editor-error">{notice}</p>}
    <button className="gold-button full" disabled={saving}>{saving ? "Salvando..." : "Salvar nova senha"}</button>
  </form></div>;
}

function SalonLogin({ onBack, onSuccess }: { onBack: () => void; onSuccess: (user: Record<string, any>) => void | Promise<void> }) {
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSending(true);
    setNotice("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setSending(false);
      setNotice(data?.error || "Não foi possível entrar.");
      return;
    }
    const profile = await fetch("/api/me").then((result) => result.ok ? result.json() : null);
    setSending(false);
    if (!profile) {
      setNotice("Conta autenticada, mas ainda não vinculada a um estabelecimento.");
      return;
    }
    await onSuccess(profile);
  }

  return <main className="auth-page salon-login-page"><button className="back-button" onClick={onBack}>← Voltar</button><section className="auth-card"><Logo /><div className="auth-heading"><span className="section-kicker">ACESSO SALONOS</span><h1>Entre na sua conta</h1><p>Use o e-mail e a senha cadastrados pelo administrador.</p></div><form className="salon-login-form" onSubmit={submit}><label>E-mail<input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com" /></label><label>Senha<input name="password" type="password" autoComplete="current-password" required minLength={8} placeholder="Sua senha" /></label>{notice && <p className="editor-error">{notice}</p>}<button className="gold-button full" disabled={sending}>{sending ? "Entrando..." : "Entrar no SalonOS"}</button></form><div className="login-separator"><span>ou</span></div><a className="emergency-login" href="/api/auth/chatgpt"><ShieldCheck aria-hidden="true" /><span><strong>Acesso de emergência do Master</strong><small>Continuar com ChatGPT durante a migração</small></span></a><a className="customer-login-link" href="/agendar"><CalendarDays aria-hidden="true" /> Sou cliente e quero agendar</a></section></main>;
}

function ClientsContent({ tenantId, quickAction, onActionHandled }: {
  tenantId: string;
  quickAction: QuickAction | null;
  onActionHandled: () => void;
}) {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("Carregando clientes...");
  const [selected, setSelected] = useState<ClientSummary | null>(null);
  const [history, setHistory] = useState<(Appointment & { price: number })[]>([]);
  const [creating, setCreating] = useState(false);

  function loadClients() {
    return fetch(`/api/clients?tenant=${encodeURIComponent(tenantId)}`)
      .then(async (response) => {
        if (response.status === 401) {
          setNotice("Entre com sua conta para visualizar os clientes.");
          return { clients: [] };
        }
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setClients(data.clients || []);
        setNotice(data.clients?.length ? "" : "Nenhum cliente cadastrado ainda.");
      })
      .catch(() => setNotice("Não foi possível carregar os clientes agora."));
  }

  useEffect(() => { loadClients(); }, [tenantId]);
  useAutoRefresh(loadClients);
  useEffect(() => {
    if (quickAction === "client") {
      setCreating(true);
      onActionHandled();
    }
  }, [quickAction, onActionHandled]);

  async function createClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("Salvando cliente...");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant: tenantId, name: form.get("name"), phone: form.get("phone") }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(data?.error || "Não foi possível cadastrar o cliente.");
      return;
    }
    setCreating(false);
    await loadClients();
  }

  function openClient(client: ClientSummary) {
    setSelected(client);
    setHistory([]);
    fetch(`/api/clients?tenant=${encodeURIComponent(tenantId)}&phone=${encodeURIComponent(client.phone)}`)
      .then((response) => response.ok ? response.json() : { history: [] })
      .then((data) => setHistory(data.history || []))
      .catch(() => setHistory([]));
  }

  const visibleClients = clients.filter((client) => {
    const term = search.trim().toLowerCase();
    return !term || client.name.toLowerCase().includes(term) || client.phone.includes(term);
  });
  const totalVisits = clients.reduce((sum, client) => sum + Number(client.completed || 0), 0);
  const totalRevenue = clients.reduce((sum, client) => sum + Number(client.totalSpent || 0), 0);

  return <div className="clients-page">
    <div className="settings-intro clients-intro">
      <div><span className="section-kicker">RELACIONAMENTO</span><h2>Clientes</h2><p>Perfis criados automaticamente a partir dos agendamentos.</p></div>
      <div className="clients-actions"><label className="client-search"><span>⌕</span><input aria-label="Buscar clientes" placeholder="Buscar por nome ou telefone" value={search} onChange={(event) => setSearch(event.target.value)} /></label><button className="gold-button compact" onClick={() => setCreating(true)}>+ Novo cliente</button></div>
    </div>
    <div className="client-metrics">
      <article><small>CLIENTES</small><strong>{clients.length}</strong><span>com histórico no estabelecimento</span></article>
      <article><small>VISITAS CONCLUÍDAS</small><strong>{totalVisits}</strong><span>atendimentos registrados</span></article>
      <article><small>RECEITA REGISTRADA</small><strong>{formatMoney(totalRevenue)}</strong><span>em serviços concluídos</span></article>
    </div>
    <section className="panel clients-panel">
      <div className="clients-head"><span>CLIENTE</span><span>CONTATO</span><span>ATENDIMENTOS</span><span>ÚLTIMA VISITA</span><span>VALOR</span><span /></div>
      {visibleClients.map((client) => <button className="client-row" key={client.phone} onClick={() => openClient(client)}>
        <span className="client identity"><i>{client.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</i><strong>{client.name}</strong></span>
        <span>{client.phone}</span><span>{client.appointments}</span><span>{formatBookingDate(client.lastVisit)}</span><b>{formatMoney(client.totalSpent)}</b><i>→</i>
      </button>)}
      {!visibleClients.length && <div className="agenda-empty">{search ? "Nenhum cliente encontrado." : notice}</div>}
    </section>
    {selected && <ClientHistory client={selected} history={history} onClose={() => setSelected(null)} />}
    {creating && <div className="appointment-overlay" role="dialog" aria-modal="true" aria-label="Novo cliente"><form className="tenant-form panel quick-client-form" onSubmit={createClient}>
      <header><div><span className="section-kicker">CLIENTES</span><h2>Novo cliente</h2><p>Cadastre o contato para encontrá-lo rapidamente.</p></div><button type="button" className="editor-close" onClick={() => setCreating(false)}>×</button></header>
      <div className="editor-fields"><label>Nome completo<input name="name" required minLength={2} autoFocus placeholder="Nome do cliente" /></label><label>WhatsApp<input name="phone" required minLength={8} placeholder="(00) 0 0000-0000" /></label></div>
      <div className="editor-actions"><button type="button" className="outline-button" onClick={() => setCreating(false)}>Cancelar</button><button className="gold-button compact" type="submit">Salvar cliente</button></div>
    </form></div>}
  </div>;
}

function ClientHistory({ client, history, onClose }: {
  client: ClientSummary;
  history: (Appointment & { price: number })[];
  onClose: () => void;
}) {
  const labels: Record<string, string> = { confirmed: "Confirmado", waiting: "Aguardando", completed: "Concluído", cancelled: "Cancelado" };
  return <div className="appointment-overlay" role="dialog" aria-modal="true" aria-label="Histórico do cliente">
    <section className="client-history panel">
      <header><div className="history-person"><span className="avatar">{client.name[0]}</span><div><span className="section-kicker">HISTÓRICO DO CLIENTE</span><h2>{client.name}</h2><p>{client.phone} · cliente desde {formatBookingDate(client.firstVisit)}</p></div></div><button className="editor-close" onClick={onClose} aria-label="Fechar">×</button></header>
      <div className="history-summary"><span><small>ATENDIMENTOS</small><strong>{client.appointments}</strong></span><span><small>CONCLUÍDOS</small><strong>{client.completed}</strong></span><span><small>VALOR TOTAL</small><strong>{formatMoney(client.totalSpent)}</strong></span></div>
      <div className="history-list">{history.map((item) => <div className="history-row" key={item.id}>
        <span><strong>{formatBookingDate(item.date)} · {item.time}</strong><small>{item.service} com {item.barber}</small></span>
        <b>{formatMoney(item.price || 0)}</b><i className={`status ${item.status === "waiting" ? "waiting" : ""}`}>{labels[item.status]}</i>
      </div>)}
      {!history.length && <div className="agenda-empty">Carregando histórico...</div>}</div>
    </section>
  </div>;
}

function formatMoney(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function FinanceContent({ tenantId }: { tenantId: string }) {
  const [period, setPeriod] = useState(toLocalISODate(new Date()).slice(0, 7));
  const [data, setData] = useState<{
    summary: { completedAppointments: number; revenue: number; averageTicket: number; commissions: number; netAfterCommissions: number };
    barbers: { barber: string; appointments: number; revenue: number; commissionRate: number; commission: number }[];
    transactions: { id: number; customerName: string; barber: string; service: string; date: string; time: string; amount: number }[];
  } | null>(null);
  const [notice, setNotice] = useState("Carregando resultados...");

  function loadFinance(silent = false) {
    if (!silent) setNotice("Carregando resultados...");
    return fetch(`/api/finance?tenant=${encodeURIComponent(tenantId)}&period=${period}`)
      .then(async (response) => {
        if (response.status === 401) {
          setNotice("Entre com sua conta para visualizar o financeiro.");
          return null;
        }
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((result) => {
        setData(result);
        if (result) setNotice("");
      })
      .catch(() => setNotice("Não foi possível carregar o financeiro agora."));
  }

  useEffect(() => {
    loadFinance();
  }, [period, tenantId]);
  useAutoRefresh(() => { loadFinance(true); });

  const summary = data?.summary || { completedAppointments: 0, revenue: 0, averageTicket: 0, commissions: 0, netAfterCommissions: 0 };
  const maxRevenue = Math.max(...(data?.barbers || []).map((item) => Number(item.revenue)), 1);

  return <div className="finance-page">
    <div className="settings-intro finance-intro">
      <div><span className="section-kicker">GESTÃO FINANCEIRA</span><h2>Financeiro</h2><p>Visão gerencial baseada nos atendimentos concluídos.</p></div>
      <div className="finance-controls"><span className="no-payments">SEM PAGAMENTOS NA PLATAFORMA</span><input aria-label="Selecionar mês" type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></div>
    </div>
    <div className="finance-metrics">
      <article><small>FATURAMENTO REALIZADO</small><strong>{formatMoney(summary.revenue)}</strong><span>{summary.completedAppointments} atendimentos concluídos</span></article>
      <article><small>TICKET MÉDIO</small><strong>{formatMoney(summary.averageTicket)}</strong><span>por atendimento concluído</span></article>
      <article><small>COMISSÕES ESTIMADAS</small><strong>{formatMoney(summary.commissions)}</strong><span>conforme percentual da equipe</span></article>
      <article><small>SALDO APÓS COMISSÕES</small><strong>{formatMoney(summary.netAfterCommissions)}</strong><span>valor gerencial, não liquidado</span></article>
    </div>
    {notice && !data && <div className="agenda-empty panel">{notice}</div>}
    {data && <div className="finance-grid">
      <section className="panel finance-team"><header><div><h2>Resultado por profissional</h2><p>Produção e comissão estimada no período</p></div></header>
        {data.barbers.map((item) => <div className="finance-barber" key={item.barber}>
          <span className="avatar">{item.barber[0]}</span><span><strong>{item.barber}</strong><small>{item.appointments} atendimentos · {item.commissionRate}% de comissão</small><i><b style={{ width: `${Number(item.revenue) / maxRevenue * 100}%` }} /></i></span>
          <span><strong>{formatMoney(item.revenue)}</strong><small>Comissão: {formatMoney(item.commission)}</small></span>
        </div>)}
        {!data.barbers.length && <div className="agenda-empty">Nenhum atendimento concluído neste período.</div>}
      </section>
      <section className="panel finance-records"><header><div><h2>Atendimentos contabilizados</h2><p>Registro operacional, sem cobrança online</p></div></header>
        <div className="finance-head"><span>DATA</span><span>CLIENTE</span><span>SERVIÇO</span><span>VALOR</span></div>
        {data.transactions.map((item) => <div className="finance-row" key={item.id}><span>{formatBookingDate(item.date)} · {item.time}</span><span><strong>{item.customerName}</strong><small>{item.barber}</small></span><span>{item.service}</span><b>{formatMoney(item.amount)}</b></div>)}
        {!data.transactions.length && <div className="agenda-empty">Sem lançamentos neste mês.</div>}
      </section>
    </div>}
    <p className="finance-disclaimer">Os valores são calculados a partir dos serviços marcados como concluídos. O SalonOS não recebe, processa nem transfere pagamentos.</p>
  </div>;
}

function AgendaContent({ tenantId, config, quickAction, onActionHandled }: {
  tenantId: string;
  config: BusinessConfig;
  quickAction: QuickAction | null;
  onActionHandled: () => void;
}) {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [items, setItems] = useState<Appointment[]>([]);
  const [notice, setNotice] = useState("Carregando agenda...");
  const [creating, setCreating] = useState(false);
  const [creationKind, setCreationKind] = useState<"appointment" | "blocked">("appointment");
  const [selected, setSelected] = useState<Appointment | null>(null);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const day = new Date(weekStart);
    day.setDate(weekStart.getDate() + index);
    return day;
  }), [weekStart]);

  function loadWeek(silent = false) {
    if (!silent) setNotice("Atualizando agenda...");
    return fetch(`/api/appointments?tenant=${encodeURIComponent(tenantId)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setItems(data.appointments || []);
        setNotice("");
      })
      .catch(() => setNotice("Não foi possível carregar a agenda."));
  }

  useEffect(() => { loadWeek(); }, [tenantId]);
  useAutoRefresh(() => { loadWeek(true); });
  useEffect(() => {
    if (quickAction === "appointment" || quickAction === "blocked") {
      setCreationKind(quickAction);
      setCreating(true);
      onActionHandled();
    }
  }, [quickAction, onActionHandled]);

  function moveWeek(offset: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + offset * 7);
    setWeekStart(next);
  }

  async function createAgendaItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const blocked = form.get("kind") === "blocked";
    setNotice(blocked ? "Criando bloqueio..." : "Salvando agendamento...");
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenant: tenantId,
        customerName: blocked ? "Horário bloqueado" : form.get("customerName"),
        phone: blocked ? "-" : form.get("phone"),
        barber: form.get("barber"),
        service: blocked ? "Bloqueio de agenda" : form.get("service"),
        date: form.get("date"),
        time: form.get("time"),
        status: blocked ? "blocked" : "confirmed",
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(data?.error || "Não foi possível salvar.");
      return;
    }
    setCreating(false);
    await loadWeek();
  }

  const weekLabel = `${weekDays[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — ${weekDays[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}`;
  return <div className="agenda-page">
    <div className="agenda-toolbar">
      <div><span className="section-kicker">AGENDA OPERACIONAL</span><h2>Semana de atendimentos</h2><p>{weekLabel}</p></div>
      <div className="agenda-controls"><button className="outline-button" onClick={() => moveWeek(-1)}>←</button><button className="outline-button" onClick={() => setWeekStart(startOfWeek(new Date()))}>Hoje</button><button className="outline-button" onClick={() => moveWeek(1)}>→</button><button className="gold-button compact" onClick={() => { setCreationKind("appointment"); setCreating(true); }}>+ Novo horário</button></div>
    </div>
    {notice && <p className="agenda-page-notice">{notice}</p>}
    <section className="week-board">
      {weekDays.map((day) => {
        const value = toLocalISODate(day);
        const dayItems = items.filter((item) => item.date === value && item.status !== "cancelled");
        const today = value === toLocalISODate(new Date());
        return <article className={`week-day ${today ? "today" : ""}`} key={value}>
          <header><small>{day.toLocaleDateString("pt-BR", { weekday: "short" }).toUpperCase()}</small><strong>{day.getDate()}</strong><span>{dayItems.length} horários</span></header>
          <div>{dayItems.map((item) => <button className={`agenda-card ${item.status}`} key={item.id} onClick={() => setSelected(item)}><b>{item.time}</b><span><strong>{item.status === "blocked" ? "Bloqueado" : item.customerName}</strong><small>{item.barber} · {item.service}</small></span></button>)}
          {!dayItems.length && <p>Livre</p>}</div>
        </article>;
      })}
    </section>
    {creating && <div className="appointment-overlay" role="dialog" aria-modal="true" aria-label="Novo horário"><form className="tenant-form panel" onSubmit={createAgendaItem}>
      <header><div><span className="section-kicker">AGENDA</span><h2>Novo horário</h2><p>Agende um cliente ou bloqueie um período.</p></div><button type="button" className="editor-close" onClick={() => setCreating(false)}>×</button></header>
      <div className="editor-fields"><label>Tipo<select name="kind" value={creationKind} onChange={(event) => setCreationKind(event.target.value as "appointment" | "blocked")}><option value="appointment">Agendamento</option><option value="blocked">Bloqueio de agenda</option></select></label><label>Data<input name="date" type="date" required defaultValue={toLocalISODate(new Date())} /></label><label>Horário<input name="time" type="time" required /></label><label>Profissional<select name="barber" required>{config.barbers.filter((item) => item.active).map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Serviço<select name="service" required disabled={creationKind === "blocked"}>{config.services.filter((item) => item.active).map((item) => <option key={item.name}>{item.name}</option>)}</select></label><label>Cliente<input name="customerName" required={creationKind === "appointment"} disabled={creationKind === "blocked"} placeholder="Nome completo" /></label><label>WhatsApp<input name="phone" required={creationKind === "appointment"} disabled={creationKind === "blocked"} placeholder="(47) 9 9999-9999" /></label></div>
      <div className="editor-actions"><button type="button" className="outline-button" onClick={() => setCreating(false)}>Cancelar</button><button className="gold-button compact" type="submit">Salvar horário</button></div>
    </form></div>}
    {selected && <AppointmentEditor appointment={selected} tenantId={tenantId} barbers={config.barbers.filter((item) => item.active).map((item) => item.name)} onClose={() => setSelected(null)} onUpdated={() => { setSelected(null); loadWeek(); }} />}
  </div>;
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  const weekday = result.getDay();
  result.setDate(result.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return result;
}

function DashboardContent({ mini = false, config = defaultConfig, tenantId = "chosen", tenantSlug = "chosen", tenantName = "Chosen Barbearia", permissions = allPanelPermissions, onNavigate, onQuickAction }: {
  mini?: boolean;
  config?: BusinessConfig;
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
  permissions?: PanelPermissions;
  onNavigate?: (section: string) => void;
  onQuickAction?: (action: QuickAction) => void;
}) {
  const [liveAppointments, setLiveAppointments] = useState<Appointment[]>([]);
  const [agendaNotice, setAgendaNotice] = useState("");
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const [checkinNotice, setCheckinNotice] = useState("");
  const [dashboardData, setDashboardData] = useState<{
    metrics: {
      todayAppointments: number;
      todayCompleted: number;
      todayRevenue: number | null;
      monthClients: number | null;
      occupancy: number;
      weeklyCapacity: number;
      weeklyAppointments: number;
    };
    team: { barber: string; appointments: number; completed: number; revenue: number | null }[];
  } | null>(null);

  function loadAgenda() {
    if (mini) return Promise.resolve();
    const today = toLocalISODate(new Date());
    return fetch(`/api/appointments?tenant=${encodeURIComponent(tenantId)}&date=${today}`)
      .then(async (response) => {
        if (response.status === 401) {
          setAgendaNotice("Entre com sua conta para visualizar a agenda real.");
          return { appointments: [] };
        }
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => setLiveAppointments(data.appointments || []))
      .catch(() => setAgendaNotice("Não foi possível carregar a agenda agora."));
  }

  function loadDashboard() {
    if (mini) return Promise.resolve();
    return fetch(`/api/dashboard?tenant=${encodeURIComponent(tenantId)}`)
      .then((response) => response.ok ? response.json() : null)
      .then(setDashboardData)
      .catch(() => setDashboardData(null));
  }

  useEffect(() => {
    loadAgenda();
    loadDashboard();
  }, [mini, tenantId]);
  useAutoRefresh(() => {
    loadAgenda();
    loadDashboard();
  }, !mini);

  const displayAppointments = mini ? appointments : liveAppointments;
  const metrics = mini ? [
    ["AGENDAMENTOS HOJE", "12", "+ 18% esta semana", CalendarDays],
    ["FATURAMENTO HOJE", "R$ 580", "+ R$ 120 vs. ontem", ChartNoAxesCombined],
    ["CLIENTES NO MÊS", "186", "+ 24 novos", UsersRound],
    ["TAXA DE OCUPAÇÃO", "78%", "Boa ocupação", Clock3],
  ] : [
    ["AGENDAMENTOS HOJE", String(dashboardData?.metrics.todayAppointments ?? 0), `${dashboardData?.metrics.todayCompleted ?? 0} concluídos`, CalendarDays],
    ["FATURAMENTO HOJE", dashboardData?.metrics.todayRevenue == null ? "Restrito" : formatCurrency(dashboardData.metrics.todayRevenue), dashboardData?.metrics.todayRevenue == null ? "Sem permissão financeira" : "Atendimentos concluídos", ChartNoAxesCombined],
    ["CLIENTES NO MÊS", dashboardData?.metrics.monthClients == null ? "Restrito" : String(dashboardData.metrics.monthClients), dashboardData?.metrics.monthClients == null ? "Sem permissão de clientes" : "Clientes únicos", UsersRound],
    ["TAXA DE OCUPAÇÃO", `${dashboardData?.metrics.occupancy ?? 0}%`, `${dashboardData?.metrics.weeklyAppointments ?? 0} de ${dashboardData?.metrics.weeklyCapacity ?? 0} horários`, Clock3],
  ];
  const teamPerformance = mini
    ? [{ barber: "Thiago", appointments: 94, completed: 94, revenue: 4700 }, { barber: "Dav", appointments: 82, completed: 82, revenue: 4100 }]
    : dashboardData?.team || [];
  const maxTeamAppointments = Math.max(...teamPerformance.map((item) => item.appointments), 1);
  const statusLabel: Record<string, string> = {
    confirmed: "Confirmado",
    waiting: "Aguardando",
    completed: "Concluído",
    cancelled: "Cancelado",
    blocked: "Bloqueado",
  };
  const pendingToday = liveAppointments.filter((item) => item.status === "confirmed" || item.status === "waiting");

  async function completeQuickAppointment(appointment: Appointment) {
    setCheckinNotice(`Concluindo atendimento de ${appointment.customerName}...`);
    const response = await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: appointment.id, tenant: tenantId, status: "completed" }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setCheckinNotice(data?.error || "Não foi possível concluir o atendimento.");
      return;
    }
    setCheckinNotice("Atendimento concluído e lançado no financeiro.");
    await loadAgenda();
  }

  return (
    <div className={`dashboard ${mini ? "mini" : ""}`}>
      {!mini && <OnboardingPanel config={config} tenantId={tenantId} tenantSlug={tenantSlug} tenantName={tenantName} onNavigate={onNavigate} />}
      <div className="metric-grid">
        {metrics.map(([label, value, note, MetricIcon]) => <article className="metric" key={String(label)}><span>{label}</span><i><MetricIcon aria-hidden="true" /></i><strong>{value}</strong><small>{note}</small></article>)}
      </div>
      <div className="dashboard-grid">
        <section className="panel appointments"><header><div><h2>Próximos agendamentos</h2><p>Acompanhe a agenda de hoje</p></div><button>Ver agenda completa →</button></header>
          <div className="table-head"><span>HORÁRIO</span><span>CLIENTE</span><span>SERVIÇO</span><span>PROFISSIONAL</span><span>STATUS</span></div>
          {displayAppointments.map((a) => {
            const customerName = "customerName" in a ? a.customerName : a.name;
            const label = statusLabel[a.status] || a.status;
            return <div className="table-row" key={`${a.time}-${customerName}`}><strong>{a.time}</strong><span className="client"><i>{customerName.split(" ").map(n => n[0]).join("").slice(0, 2)}</i>{customerName}</span><span>{a.service}</span><span>{a.barber}</span>{mini
              ? <span className={`status ${label === "Aguardando" ? "waiting" : ""}`}>{label}</span>
              : <button className={`status agenda-edit ${label === "Aguardando" ? "waiting" : ""}`} onClick={() => setSelectedAppointment(a as Appointment)}>{label} · editar</button>}</div>;
          })}
          {!displayAppointments.length && <div className="agenda-empty">{agendaNotice || "Nenhum agendamento para hoje."}</div>}
        </section>
        <section className="panel performance"><header><div><h2>Desempenho da equipe</h2><p>Atendimentos neste mês</p></div></header>{teamPerformance.map((item) => { const professional = config.barbers.find((barberItem) => barberItem.name === item.barber); return <div className="performer" key={item.barber}><span className="avatar dashboard-barber-photo">{professional?.photoKey ? <img src={`/api/barber-photo?tenant=${encodeURIComponent(tenantId)}&key=${encodeURIComponent(professional.photoKey)}`} alt={`Foto de ${item.barber}`} /> : item.barber[0]}</span><span><strong>{item.barber}</strong><small>{item.appointments} atendimentos · {item.completed} concluídos</small></span><b>{item.revenue == null ? "Restrito" : formatCurrency(item.revenue)}</b><div className="bar"><i style={{ width: `${Math.round(item.appointments / maxTeamAppointments * 100)}%` }} /></div></div>; })}{!teamPerformance.length && <div className="agenda-empty">Ainda não há dados da equipe neste mês.</div>}<div className="occupancy"><span><small>OCUPAÇÃO DA SEMANA</small><strong>{mini ? 78 : dashboardData?.metrics.occupancy ?? 0}%</strong></span><div className="ring">{mini ? 78 : dashboardData?.metrics.occupancy ?? 0}</div></div></section>
      </div>
      {selectedAppointment && <AppointmentEditor
        appointment={selectedAppointment}
        tenantId={tenantId}
        barbers={config.barbers.filter((item) => item.active).map((item) => item.name)}
        onClose={() => setSelectedAppointment(null)}
        onUpdated={() => { setSelectedAppointment(null); loadAgenda(); }}
      />}
      {!mini && <section className="panel quick-actions"><h2>Ações rápidas</h2><div>{permissions.agenda && <button onClick={() => onQuickAction?.("appointment")}>+ Agendamento</button>}{permissions.clients && <button onClick={() => onQuickAction?.("client")}>♙ Novo cliente</button>}{permissions.agenda && <button onClick={() => onQuickAction?.("blocked")}>▦ Bloquear horário</button>}{permissions.agenda && <button onClick={() => { setCheckinNotice(""); setCheckinOpen(true); }}>↗ Registrar entrada</button>}</div></section>}
      {checkinOpen && <div className="appointment-overlay" role="dialog" aria-modal="true" aria-label="Registrar entrada"><section className="client-history panel quick-checkin">
        <header><div><span className="section-kicker">ATENDIMENTOS DE HOJE</span><h2>Registrar entrada</h2><p>Conclua o atendimento para lançá-lo automaticamente no financeiro.</p></div><button className="editor-close" onClick={() => setCheckinOpen(false)} aria-label="Fechar">×</button></header>
        <div className="quick-checkin-list">{pendingToday.map((item) => <button key={item.id} onClick={() => completeQuickAppointment(item)}><span><strong>{item.time} · {item.customerName}</strong><small>{item.service} com {item.barber}</small></span><b>Concluir →</b></button>)}{!pendingToday.length && <div className="agenda-empty">Nenhum atendimento pendente para hoje.</div>}</div>
        {checkinNotice && <p className="agenda-page-notice">{checkinNotice}</p>}
      </section></div>}
    </div>
  );
}

function OnboardingPanel({ config, tenantId, tenantSlug, tenantName, onNavigate }: {
  config: BusinessConfig;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  onNavigate?: (section: string) => void;
}) {
  const [bookingLink, setBookingLink] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [shared, setShared] = useState(false);
  const [copyNotice, setCopyNotice] = useState("");
  const storageKey = `salonos-onboarding:${tenantId}:shared`;

  useEffect(() => {
    const link = `${window.location.origin}/agendar/${tenantSlug}`;
    setBookingLink(link);
    setShared(window.localStorage.getItem(storageKey) === "1");
    QRCode.toDataURL(link, {
      width: 220,
      margin: 1,
      color: { dark: "#111311", light: "#ffffff" },
    }).then(setQrCode).catch(() => setQrCode(""));
  }, [tenantSlug, storageKey]);

  const steps = [
    { label: "Cadastrar serviços e preços", done: config.services.some((item) => item.active && item.name.trim()), section: "Serviços" },
    { label: "Configurar pelo menos um profissional", done: config.barbers.some((item) => item.active && item.name.trim()), section: "Equipe" },
    { label: "Definir os horários de funcionamento", done: config.hours.some((item) => item.active && item.open < item.close), section: "Configurações" },
    { label: "Compartilhar o link de agendamento", done: shared, section: "" },
  ];
  const completed = steps.filter((item) => item.done).length;
  const progress = Math.round(completed / steps.length * 100);

  async function copyPublicLink() {
    await navigator.clipboard.writeText(bookingLink);
    window.localStorage.setItem(storageKey, "1");
    setShared(true);
    setCopyNotice("Link copiado");
    window.setTimeout(() => setCopyNotice(""), 1800);
  }

  return <section className={`panel onboarding-panel ${completed === steps.length ? "complete" : ""}`}>
    <div className="onboarding-main">
      <header>
        <div><span className="section-kicker">PRIMEIROS PASSOS</span><h2>{completed === steps.length ? "Sua agenda está pronta" : `Prepare ${tenantName} para receber clientes`}</h2><p>{completed} de {steps.length} etapas concluídas</p></div>
        <strong>{progress}%</strong>
      </header>
      <div className="onboarding-progress"><i style={{ width: `${progress}%` }} /></div>
      <div className="onboarding-steps">{steps.map((item, index) => <button type="button" className={item.done ? "done" : ""} key={item.label} onClick={() => item.section ? onNavigate?.(item.section) : copyPublicLink()}>
        <i>{item.done ? "✓" : index + 1}</i><span><strong>{item.label}</strong><small>{item.done ? "Concluído" : item.section ? "Configurar agora" : "Copiar e compartilhar"}</small></span><b>→</b>
      </button>)}</div>
    </div>
    <aside className="onboarding-share">
      <span className="section-kicker">AGENDAMENTO ONLINE</span>
      <div className="qr-frame">{qrCode ? <img src={qrCode} alt={`QR Code do agendamento de ${tenantName}`} /> : <span>Gerando QR Code…</span>}</div>
      <strong>Aponte a câmera para agendar</strong>
      <small>{bookingLink}</small>
      <div><button className="gold-button compact" type="button" onClick={copyPublicLink}><Link2 aria-hidden="true" /> {copyNotice || "Copiar link"}</button>{qrCode && <a className="outline-button compact" href={qrCode} download={`agendamento-${tenantSlug}.png`}>Baixar QR</a>}</div>
    </aside>
  </section>;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

function AppointmentEditor({ appointment, tenantId, barbers, onClose, onUpdated }: {
  appointment: Appointment;
  tenantId: string;
  barbers: string[];
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [date, setDate] = useState(appointment.date);
  const [time, setTime] = useState(appointment.time);
  const [barber, setBarber] = useState(appointment.barber);
  const [status, setStatus] = useState(appointment.status);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const confirmationMessage = `Olá, ${appointment.customerName}! Seu horário para ${appointment.service} está confirmado para ${formatBookingDate(date)} às ${time}, com ${barber}. Se precisar alterar, responda esta mensagem.`;
  const reminderMessage = `Olá, ${appointment.customerName}! Passando para lembrar do seu horário de ${appointment.service} em ${formatBookingDate(date)}, às ${time}, com ${barber}. Até breve!`;

  async function save(nextStatus = status) {
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: appointment.id, tenant: tenantId, date, time, barber, status: nextStatus }),
    });
    setSaving(false);
    if (response.ok) {
      onUpdated();
      return;
    }
    if (response.status === 401) {
      window.location.assign("/signin-with-chatgpt?return_to=/");
      return;
    }
    const data = await response.json().catch(() => null);
    setNotice(data?.error || "Não foi possível atualizar o atendimento.");
  }

  return <div className="appointment-overlay" role="dialog" aria-modal="true" aria-label="Editar agendamento">
    <section className="appointment-editor panel">
      <header><div><span className="section-kicker">AGENDA</span><h2>{appointment.customerName}</h2><p>{appointment.service} · {appointment.phone}</p></div><button className="editor-close" onClick={onClose} aria-label="Fechar">×</button></header>
      <div className="editor-fields">
        <label>Data<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label>Horário<input type="time" value={time} onChange={(event) => setTime(event.target.value)} /></label>
        <label>Profissional<select value={barber} onChange={(event) => setBarber(event.target.value)}>{barbers.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as Appointment["status"])}>
          <option value="confirmed">Confirmado</option>
          <option value="waiting">Aguardando</option>
          <option value="completed">Concluído</option>
      <option value="cancelled">Cancelado</option>
      <option value="blocked">Bloqueado</option>
        </select></label>
      </div>
      {notice && <p className="editor-error">{notice}</p>}
      {appointment.status !== "blocked" && <div className="whatsapp-actions">
        <span><MessageCircle aria-hidden="true" /><strong>WhatsApp</strong><small>A mensagem será aberta pronta para revisão antes do envio.</small></span>
        <div><a href={whatsappUrl(appointment.phone, confirmationMessage)} target="_blank" rel="noreferrer">Enviar confirmação</a><a href={whatsappUrl(appointment.phone, reminderMessage)} target="_blank" rel="noreferrer">Enviar lembrete</a></div>
      </div>}
      <div className="editor-actions">
        <button className="danger-button" disabled={saving} onClick={() => save("cancelled")}>Cancelar atendimento</button>
        <button className="gold-button compact" disabled={saving} onClick={() => save()}>{saving ? "Salvando..." : "Salvar alterações"}</button>
      </div>
    </section>
  </div>;
}

function whatsappUrl(phone: string, message: string) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function MasterContent({ section, onNavigate }: { section: string; onNavigate: (section: string) => void }) {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [notice, setNotice] = useState("Carregando estabelecimentos...");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<TenantSummary | null>(null);
  const [formNotice, setFormNotice] = useState("");

  function loadTenants() {
    return fetch("/api/tenants")
      .then(async (response) => {
        if (!response.ok) {
          setNotice(response.status === 403 ? "Acesso restrito ao proprietário do SalonOS." : "Não foi possível carregar os estabelecimentos.");
          return { tenants: [] };
        }
        return response.json();
      })
      .then((data) => {
        setTenants(data.tenants || []);
        setNotice(data.tenants?.length ? "" : "Nenhum estabelecimento cadastrado.");
      })
      .catch(() => setNotice("Não foi possível carregar os estabelecimentos."));
  }

  useEffect(() => { loadTenants(); }, []);
  useAutoRefresh(loadTenants);

  async function createTenant(values: TenantOnboarding, logo: File | null) {
    setFormNotice("Criando estabelecimento...");
    const response = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setFormNotice(data?.error || "Não foi possível criar o estabelecimento.");
      return false;
    }
    const credentialResponse = await fetch("/api/auth/manage-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: values.ownerEmail, password: values.managerPassword, displayName: values.name }),
    });
    if (!credentialResponse.ok) {
      const credentialError = await credentialResponse.json().catch(() => null);
      setFormNotice(credentialError?.error || "Estabelecimento criado, mas não foi possível criar a senha do gestor.");
      await loadTenants();
      return false;
    }
    if (logo && logo.size > 0 && data?.id) {
      const logoForm = new FormData();
      logoForm.set("logo", logo);
      await fetch(`/api/tenant-logo?tenant=${encodeURIComponent(data.id)}`, {
        method: "POST",
        body: logoForm,
      });
    }
    const configResponse = await fetch(`/api/config?tenant=${encodeURIComponent(data.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        services: [{ name: values.serviceName, price: Number(values.servicePrice), duration: Number(values.serviceDuration), active: true }],
        barbers: [{
          name: values.professionalName, email: values.professionalEmail, phone: "", photoKey: null, accessEnabled: false, accessMustChange: false, role: "Profissional",
          commission: 30, services: [values.serviceName], workDays: ["2", "3", "4", "5", "6"],
          workStart: values.open, workEnd: values.close, breakStart: "", breakEnd: "", timeOff: [],
          permissions: { agenda: true, clients: true, finance: false, settings: false }, active: true,
        }],
        hours: [{ label: "Terça a sábado", days: "2,3,4,5,6", open: values.open, close: values.close, active: true }],
      }),
    });
    if (!configResponse.ok) {
      setFormNotice("Empresa criada, mas a configuração inicial precisa ser revisada.");
      await loadTenants();
      return false;
    }
    setCreating(false);
    setFormNotice("");
    await loadTenants();
    return true;
  }

  async function toggleTenant(tenant: TenantSummary) {
    await fetch("/api/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tenant.id, active: !tenant.active }),
    });
    loadTenants();
  }

  async function deleteTenant(tenant: TenantSummary) {
    const confirmed = window.confirm(
      `Excluir definitivamente "${tenant.name}"?\n\nAgendamentos, serviços, profissionais, horários e a logo também serão removidos. Esta ação não pode ser desfeita.`,
    );
    if (!confirmed) return;
    setNotice(`Excluindo ${tenant.name}...`);
    const response = await fetch("/api/tenants", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tenant.id }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(data?.error || "Não foi possível excluir o estabelecimento.");
      return;
    }
    setNotice(`${tenant.name} foi excluído.`);
    await loadTenants();
  }

  async function changeTenantPlan(tenant: TenantSummary, plan: string) {
    setNotice(`Atualizando o plano de ${tenant.name}...`);
    const response = await fetch("/api/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: tenant.id, plan }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      setNotice(data?.error || "Não foi possível alterar o plano.");
      return;
    }
    setNotice("Plano atualizado.");
    await loadTenants();
  }

  async function updateTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const nextOwnerEmail = String(form.get("ownerEmail") || "").trim().toLowerCase();
    const newPassword = String(form.get("managerPassword") || "");
    if (nextOwnerEmail !== String(editing.ownerEmail || "").toLowerCase() && !newPassword) {
      setFormNotice("Ao trocar o e-mail do responsável, defina também uma nova senha para o gestor.");
      return;
    }
    setFormNotice("Salvando alterações...");
    const response = await fetch("/api/tenants", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editing.id,
        name: form.get("name"),
        city: form.get("city"),
        phone: form.get("phone"),
        ownerEmail: form.get("ownerEmail"),
        businessType: form.get("businessType"),
        theme: form.get("theme"),
        plan: form.get("plan"),
        active: form.get("active") === "on",
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      setFormNotice(data?.error || "Não foi possível atualizar o estabelecimento.");
      return;
    }
    if (newPassword) {
      const credentialResponse = await fetch("/api/auth/manage-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.get("ownerEmail"),
          password: newPassword,
          displayName: form.get("name"),
        }),
      });
      if (!credentialResponse.ok) {
        const credentialError = await credentialResponse.json().catch(() => null);
        setFormNotice(credentialError?.error || "Dados salvos, mas não foi possível atualizar a senha.");
        return;
      }
    }
    const logo = form.get("logo");
    if (logo instanceof File && logo.size > 0) {
      const logoForm = new FormData();
      logoForm.set("logo", logo);
      const logoResponse = await fetch(`/api/tenant-logo?tenant=${encodeURIComponent(editing.id)}`, {
        method: "POST",
        body: logoForm,
      });
      if (!logoResponse.ok) {
        const logoError = await logoResponse.json().catch(() => null);
        setFormNotice(logoError?.error || "Dados salvos, mas não foi possível atualizar a logo.");
        return;
      }
    }
    setEditing(null);
    setFormNotice("");
    loadTenants();
  }

  const activeCount = tenants.filter((tenant) => tenant.active).length;
  const totalAppointments = tenants.reduce((sum, tenant) => sum + Number(tenant.appointments || 0), 0);
  const planCounts = tenants.reduce<Record<string, number>>((counts, tenant) => {
    counts[tenant.plan] = (counts[tenant.plan] || 0) + 1;
    return counts;
  }, {});

  if (section === "Assinaturas") {
    return <div className="owner-page master-section-page"><div className="settings-intro owner-intro"><div><span className="section-kicker">GESTÃO COMERCIAL</span><h2>Assinaturas</h2><p>Controle manualmente os planos das empresas. Pagamentos pela plataforma continuam desativados.</p></div></div><div className="owner-metrics"><article><small>ASSINATURAS ATIVAS</small><strong>{activeCount}</strong><span>Empresas habilitadas</span></article><article><small>SEM COBRANÇA ONLINE</small><strong>100%</strong><span>Controle comercial manual</span></article><article><small>EMPRESAS INATIVAS</small><strong>{tenants.length - activeCount}</strong><span>Sem acesso operacional</span></article></div><section className="panel subscription-list"><div className="subscription-head"><span>EMPRESA</span><span>PLANO</span><span>STATUS</span><span>AGENDAMENTOS</span><span>LINK</span></div>{tenants.map((tenant) => <div className="subscription-row" key={tenant.id}><span className="tenant-name">{tenant.logoUrl ? <img className="tenant-list-logo" src={tenant.logoUrl} alt="" /> : <i className="workspace-icon">{tenant.name[0]}</i>}<span><strong>{tenant.name}</strong><small>{tenant.ownerEmail || "Sem gestor"}</small></span></span><select aria-label={`Plano de ${tenant.name}`} value={tenant.plan} onChange={(event) => changeTenantPlan(tenant, event.target.value)}><option value="starter">Starter</option><option value="pro">Pro</option><option value="premium">Premium</option></select><button className={`tenant-toggle ${tenant.active ? "active" : ""}`} onClick={() => toggleTenant(tenant)}><i />{tenant.active ? "Ativa" : "Inativa"}</button><b>{tenant.appointments}</b><a href={`/agendar/${tenant.slug}`} target="_blank" rel="noreferrer">Abrir ↗</a></div>)}{!tenants.length && <div className="agenda-empty">{notice}</div>}</section><p className="commercial-note">O SalonOS não processa pagamentos. O plano serve apenas para organizar contratos e recursos liberados por empresa.</p></div>;
  }

  if (section === "Planos") {
    const plans = [
      { id: "starter", name: "Starter", description: "O essencial para organizar um negócio pequeno", count: planCounts.starter || 0, features: ["Agenda e link de agendamento", "Cadastro básico de clientes", "Serviços e horários", "1 profissional"] },
      { id: "pro", name: "Pro", description: "Gestão completa para negócios em crescimento", count: planCounts.pro || 0, features: ["Tudo do Starter", "Controle de estoque e produtos", "Financeiro e relatórios", "Equipe, permissões e até 5 profissionais"] },
      { id: "premium", name: "Premium", description: "Estrutura avançada para redes e operações maiores", count: planCounts.premium || 0, features: ["Tudo do Pro", "Profissionais ilimitados", "Múltiplas unidades", "Suporte prioritário e recursos avançados"] },
    ];
    return <div className="owner-page master-section-page"><div className="settings-intro owner-intro"><div><span className="section-kicker">GESTÃO COMERCIAL</span><h2>Planos do SalonOS</h2><p>Estruture os níveis de serviço sem ativar cobranças pela plataforma.</p></div></div><div className="plan-management-grid">{plans.map((plan) => <article className={`panel plan-management-card ${plan.id === "pro" ? "featured" : ""}`} key={plan.id}>{plan.id === "pro" && <em>MAIS UTILIZADO</em>}<span className="workspace-icon">{plan.name[0]}</span><h3>{plan.name}</h3><p>{plan.description}</p><strong>{plan.count} <small>{plan.count === 1 ? "empresa" : "empresas"}</small></strong><ul>{plan.features.map((feature) => <li key={feature}>✓ {feature}</li>)}</ul><button className="outline-button" onClick={() => onNavigate("Assinaturas")}>Gerenciar empresas</button></article>)}</div>{notice && <p className="commercial-note">{notice}</p>}<section className="panel no-payment-banner"><ShieldCheck aria-hidden="true" /><span><strong>Pagamentos desativados</strong><small>Nenhuma empresa ou cliente será cobrado pelo SalonOS nesta fase.</small></span></section></div>;
  }

  if (section === "Atividades") {
    return <AuditLogContent tenants={tenants} />;
  }

  if (section === "Usuários Master") {
    return <PlatformAdminsContent />;
  }

  if (section === "Configurações") {
    return <MasterAccessSettings />;
  }

  if (!["Visão geral", "Estabelecimentos"].includes(section)) {
    const sectionContent: Record<string, { title: string; description: string; cards: [string, string, string][] }> = {
      Suporte: {
        title: "Central de suporte",
        description: "Acompanhe solicitações e organize o atendimento às empresas.",
        cards: [["CHAMADOS ABERTOS", "0", "Nenhuma pendência"], ["EM ATENDIMENTO", "0", "Fila atual"], ["RESOLVIDOS", "0", "Histórico recente"]],
      },
      "Configurações": {
        title: "Configurações do SalonOS",
        description: "Preferências gerais e segurança do painel proprietário.",
        cards: [["ACESSO MASTER", "Protegido", "Conta proprietária verificada"], ["PAGAMENTOS", "Desativados", "Conforme configuração atual"], ["EMPRESAS ATIVAS", String(activeCount), "Controle individual disponível"]],
      },
    };
    const content = sectionContent[section] || sectionContent["Configurações"];
    return <div className="owner-page master-section-page"><div className="settings-intro owner-intro"><div><span className="section-kicker">PAINEL MASTER</span><h2>{content.title}</h2><p>{content.description}</p></div></div><div className="owner-metrics">{content.cards.map(([label, value, detail]) => <article key={label}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>)}</div><section className="panel master-empty-state"><Store aria-hidden="true" /><h3>Módulo preparado</h3><p>Esta seção já está separada no painel e será aprofundada nas próximas etapas do SalonOS.</p></section></div>;
  }

  return <div className="owner-page">
    <div className="settings-intro owner-intro"><div><span className="section-kicker">PROPRIETÁRIO SALONOS</span><h2>{section === "Estabelecimentos" ? "Estabelecimentos cadastrados" : "Visão geral da plataforma"}</h2><p>{section === "Estabelecimentos" ? "Cadastre salões e barbearias e controle quais páginas podem receber agendamentos." : "Acompanhe os principais números e a operação da sua rede."}</p></div>{section === "Estabelecimentos" && <button className="gold-button compact" onClick={() => setCreating(true)}>+ Novo estabelecimento</button>}</div>
    <div className="owner-metrics"><article><small>ESTABELECIMENTOS CADASTRADOS</small><strong>{tenants.length}</strong></article><article><small>PÁGINAS ATIVAS</small><strong>{activeCount}</strong></article><article><small>AGENDAMENTOS NA REDE</small><strong>{totalAppointments}</strong></article></div>
    <section className="panel owner-list"><div className="owner-head"><span>ESTABELECIMENTO</span><span>ENDEREÇO PÚBLICO</span><span>CONTATO</span><span>AGENDAMENTOS</span><span>STATUS</span><span>AÇÕES</span></div>
      {tenants.map((tenant) => <div className="owner-row" key={tenant.id}>
      <span className="tenant-name">{tenant.logoUrl ? <img className="tenant-list-logo" src={tenant.logoUrl} alt="" /> : <i className="workspace-icon">{tenant.name[0]}</i>}<span><strong>{tenant.name}</strong><small>{tenant.businessType === "salon" ? "Salão" : "Barbearia"} · {tenant.city} · tema {tenant.theme}</small></span></span>
      <a href={`/agendar/${tenant.slug}`} target="_blank" rel="noreferrer">/agendar/{tenant.slug} ↗</a><span>{tenant.phone}<small>{tenant.ownerEmail || "Sem responsável"}</small></span><b>{tenant.appointments}</b>
      <button className={`tenant-toggle ${tenant.active ? "active" : ""}`} onClick={() => toggleTenant(tenant)}><i />{tenant.active ? "Habilitada" : "Desabilitada"}</button><span className="owner-actions"><button className="owner-edit" onClick={() => { setFormNotice(""); setEditing(tenant); }}>Editar</button><button className="owner-delete" onClick={() => deleteTenant(tenant)}>Excluir</button></span>
      </div>)}
      {!tenants.length && <div className="agenda-empty">{notice}</div>}
    </section>
    {creating && <TenantOnboardingWizard notice={formNotice} onClose={() => { setCreating(false); setFormNotice(""); }} onFinish={createTenant} />}
    {editing && <div className="appointment-overlay" role="dialog" aria-modal="true" aria-label="Editar estabelecimento"><form className="tenant-form panel" onSubmit={updateTenant}>
      <header><div><span className="section-kicker">GESTÃO DA EMPRESA</span><h2>Editar {editing.name}</h2><p>Atualize o responsável, o plano e a disponibilidade da unidade.</p></div><button type="button" className="editor-close" onClick={() => setEditing(null)}>×</button></header>
      <div className="editor-fields"><label>Nome<input name="name" required defaultValue={editing.name} /></label><label>Tipo de negócio<select name="businessType" defaultValue={editing.businessType || "barbershop"}><option value="barbershop">Barbearia</option><option value="salon">Salão</option></select></label><label>Tema do agendamento<select name="theme" defaultValue={editing.theme || "black"}><option value="black">Black</option><option value="white">White</option></select></label><label>Cidade<input name="city" required defaultValue={editing.city} /></label><label>WhatsApp<input name="phone" required defaultValue={editing.phone} /></label><label>E-mail do responsável<input name="ownerEmail" type="email" defaultValue={editing.ownerEmail || ""} placeholder="Sem responsável vinculado" /></label><label>Nova senha do gestor<input name="managerPassword" type="password" minLength={8} placeholder="Deixe vazio para manter" /></label><label>Plano<select name="plan" defaultValue={editing.plan}><option value="starter">Starter</option><option value="pro">Pro</option><option value="premium">Premium</option></select></label><label>Trocar logo<input name="logo" type="file" accept="image/png,image/jpeg,image/webp" /></label><label className="tenant-active-check"><input name="active" type="checkbox" defaultChecked={editing.active} /> Empresa habilitada</label></div>
      {formNotice && <p className="editor-error">{formNotice}</p>}<div className="editor-actions"><button type="button" className="outline-button" onClick={() => setEditing(null)}>Cancelar</button><button className="gold-button compact" type="submit">Salvar alterações</button></div>
    </form></div>}
  </div>;
}

function PlatformAdminsContent() {
  const [admins, setAdmins] = useState<PlatformAdminSummary[]>([]);
  const [limit, setLimit] = useState(2);
  const [notice, setNotice] = useState("Carregando usuários...");
  const [saving, setSaving] = useState(false);

  function loadAdmins() {
    return fetch("/api/platform-admins")
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || "Não foi possível carregar os usuários.");
        setAdmins(data.admins || []);
        setLimit(Number(data.limit || 2));
        setNotice("");
      })
      .catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível carregar os usuários."));
  }

  useEffect(() => { loadAdmins(); }, []);
  useAutoRefresh(loadAdmins);

  async function saveAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setNotice("Criando acesso geral...");
    const response = await fetch("/api/platform-admins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: data.get("displayName"),
        email: data.get("email"),
        password: data.get("password"),
      }),
    });
    const result = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) {
      setNotice(result?.error || "Não foi possível criar o usuário.");
      return;
    }
    form.reset();
    setNotice("Administrador geral criado com sucesso.");
    await loadAdmins();
  }

  async function removeAdmin(admin: PlatformAdminSummary) {
    if (!window.confirm(`Remover o acesso geral de ${admin.displayName}?`)) return;
    setNotice(`Removendo ${admin.displayName}...`);
    const response = await fetch("/api/platform-admins", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: admin.email }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      setNotice(result?.error || "Não foi possível remover o usuário.");
      return;
    }
    setNotice("Acesso removido.");
    await loadAdmins();
  }

  const additionalAdmins = admins.filter((admin) => !admin.primary);
  const available = Math.max(0, limit - additionalAdmins.length);

  return <div className="owner-page master-section-page platform-admin-page">
    <div className="settings-intro owner-intro"><div><span className="section-kicker">ACESSO GERAL</span><h2>Usuários Master</h2><p>Cadastre até dois administradores adicionais com controle completo da plataforma.</p></div></div>
    <div className="owner-metrics"><article><small>PROPRIETÁRIO PRINCIPAL</small><strong>Rafael Doneda</strong><span>Acesso permanente</span></article><article><small>ADMINISTRADORES ADICIONAIS</small><strong>{additionalAdmins.length}/{limit}</strong><span>Comando geral</span></article><article><small>VAGAS DISPONÍVEIS</small><strong>{available}</strong><span>Limite protegido</span></article></div>
    <div className="platform-admin-layout">
      <section className="panel platform-admin-form">
        <header><ShieldCheck aria-hidden="true" /><div><h3>Novo administrador geral</h3><p>O usuário terá acesso a empresas, planos, atividades e configurações.</p></div></header>
        <form onSubmit={saveAdmin}>
          <label>Nome completo<input name="displayName" required placeholder="Nome do administrador" /></label>
          <label>E-mail<input name="email" type="email" required placeholder="usuario@empresa.com" /></label>
          <label>Senha inicial<input name="password" type="password" minLength={8} required placeholder="Mínimo de 8 caracteres" /></label>
          <button className="gold-button full" disabled={saving || available === 0}>{saving ? "Criando acesso..." : available === 0 ? "Limite atingido" : "Criar administrador"}</button>
        </form>
        {notice && <p className="commercial-note">{notice}</p>}
      </section>
      <section className="panel platform-admin-list">
        <header><div><h3>Acessos com comando geral</h3><p>Todos os usuários abaixo podem administrar integralmente o SalonOS.</p></div></header>
        {admins.map((admin) => <article key={admin.email}>
          <span className="platform-admin-avatar">{admin.displayName.slice(0, 2).toUpperCase()}</span>
          <span><strong>{admin.displayName}</strong><small>{admin.email}</small></span>
          <em>{admin.primary ? "PROPRIETÁRIO" : admin.current ? "VOCÊ" : "ADMIN GERAL"}</em>
          {!admin.primary && !admin.current && <button className="owner-delete" onClick={() => removeAdmin(admin)}>Remover</button>}
        </article>)}
      </section>
    </div>
  </div>;
}

function AuditLogContent({ tenants }: { tenants: TenantSummary[] }) {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [tenantFilter, setTenantFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [notice, setNotice] = useState("Carregando atividades...");

  function loadAudit(silent = false) {
    const params = new URLSearchParams();
    if (tenantFilter) params.set("tenant", tenantFilter);
    if (categoryFilter) params.set("category", categoryFilter);
    if (!silent) setNotice("Carregando atividades...");
    return fetch(`/api/audit?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        setLogs(data.logs || []);
        setNotice(data.logs?.length ? "" : "Nenhuma atividade encontrada para estes filtros.");
      })
      .catch(() => setNotice("Não foi possível carregar o histórico."));
  }

  useEffect(() => {
    loadAudit();
  }, [tenantFilter, categoryFilter]);
  useAutoRefresh(() => { loadAudit(true); });

  const categories: Record<string, string> = {
    company: "Empresa",
    status: "Ativação",
    plan: "Plano",
    access: "Acesso",
  };
  const todayCount = logs.filter((log) => new Date(log.createdAt).toDateString() === new Date().toDateString()).length;
  const uniqueActors = new Set(logs.map((log) => log.actorEmail)).size;

  return <div className="owner-page audit-page"><div className="settings-intro owner-intro"><div><span className="section-kicker">SEGURANÇA E CONTROLE</span><h2>Histórico de atividades</h2><p>Acompanhe as alterações realizadas no Painel Master.</p></div></div><div className="owner-metrics"><article><small>REGISTROS EXIBIDOS</small><strong>{logs.length}</strong></article><article><small>ATIVIDADES HOJE</small><strong>{todayCount}</strong></article><article><small>USUÁRIOS IDENTIFICADOS</small><strong>{uniqueActors}</strong></article></div><section className="panel audit-panel"><header className="audit-toolbar"><div><strong>Registro de alterações</strong><small>Os eventos mais recentes aparecem primeiro.</small></div><div><select aria-label="Filtrar por empresa" value={tenantFilter} onChange={(event) => setTenantFilter(event.target.value)}><option value="">Todas as empresas</option>{tenants.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name}</option>)}</select><select aria-label="Filtrar por tipo" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">Todos os tipos</option><option value="company">Empresa</option><option value="status">Ativação</option><option value="plan">Plano</option><option value="access">Acesso</option></select></div></header><div className="audit-head"><span>DATA E HORA</span><span>EMPRESA</span><span>TIPO</span><span>ATIVIDADE</span><span>REALIZADO POR</span></div>{logs.map((log) => <article className="audit-row" key={log.id}><time dateTime={new Date(log.createdAt).toISOString()}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(log.createdAt))}</time><strong>{log.tenantName}</strong><span className={`audit-category ${log.category}`}>{categories[log.category] || log.category}</span><p>{log.description}</p><small>{log.actorEmail}</small></article>)}{!logs.length && <div className="agenda-empty">{notice}</div>}</section></div>;
}

function MasterAccessSettings() {
  const [email, setEmail] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((response) => response.ok ? response.json() : null).then((user) => {
      if (user?.email) setEmail(user.email);
    });
  }, []);

  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setNotice("Salvando acesso...");
    const response = await fetch("/api/auth/manage-user", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: form.get("password"), displayName: "Rafael Doneda" }),
    });
    const data = await response.json().catch(() => null);
    setSaving(false);
    setNotice(response.ok ? "Senha do Master configurada. Você já pode entrar sem o ChatGPT." : data?.error || "Não foi possível salvar a senha.");
    if (response.ok) event.currentTarget.reset();
  }

  return <div className="owner-page master-section-page"><div className="settings-intro owner-intro"><div><span className="section-kicker">SEGURANÇA</span><h2>Acesso do Master</h2><p>Configure o login próprio do proprietário principal do SalonOS.</p></div></div><section className="panel master-password-panel"><ShieldCheck aria-hidden="true" /><div><h3>Rafael Doneda · Proprietário</h3><p>Esta é a conta principal e permanente do Painel Master.</p><form onSubmit={savePassword}><label>E-mail<input value={email} readOnly /></label><label>Nova senha<input name="password" type="password" minLength={8} required placeholder="Mínimo de 8 caracteres" /></label><button className="gold-button compact" disabled={saving}>{saving ? "Salvando..." : "Salvar senha do Master"}</button></form>{notice && <p className="commercial-note">{notice}</p>}</div></section><section className="panel no-payment-banner"><ShieldCheck aria-hidden="true" /><span><strong>Acesso principal protegido</strong><small>Administradores adicionais podem ser gerenciados em Usuários Master.</small></span></section></div>;
}

function TenantOnboardingWizard({ notice, onClose, onFinish }: {
  notice: string;
  onClose: () => void;
  onFinish: (values: TenantOnboarding, logo: File | null) => Promise<boolean>;
}) {
  const [step, setStep] = useState(0);
  const [logo, setLogo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<TenantOnboarding>({
    name: "", slug: "", city: "", phone: "", ownerEmail: "", managerPassword: "", businessType: "barbershop", theme: "black", plan: "pro",
    serviceName: "Corte", servicePrice: "50", serviceDuration: "50",
    professionalName: "", professionalEmail: "", open: "09:00", close: "18:00", active: true,
  });
  const steps = ["Empresa", "Identidade", "Operação", "Revisão"];
  const set = (key: keyof TenantOnboarding, value: string | boolean) => setValues((current) => ({ ...current, [key]: value }));
  const slugify = (text: string) => text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50);
  const validStep = step === 0
    ? Boolean(values.name && values.slug.length >= 3 && values.city && values.phone && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.ownerEmail) && values.managerPassword.length >= 8)
    : step === 1 ? true
      : Boolean(values.serviceName && Number(values.servicePrice) >= 0 && Number(values.serviceDuration) >= 10 && values.professionalName && values.open < values.close);

  async function submit() {
    setSaving(true);
    const ok = await onFinish(values, logo);
    if (!ok) setSaving(false);
  }

  return <div className="appointment-overlay onboarding-overlay" role="dialog" aria-modal="true" aria-label="Configurar nova empresa">
    <section className="tenant-form onboarding-wizard panel">
      <header><div><span className="section-kicker">ONBOARDING DA EMPRESA</span><h2>Nova empresa</h2><p>Configure o essencial para começar a operar no SalonOS.</p></div><button type="button" className="editor-close" onClick={onClose}>×</button></header>
      <div className="onboarding-steps">{steps.map((label, index) => <span key={label} className={index === step ? "active" : index < step ? "done" : ""}><b>{index < step ? "✓" : index + 1}</b>{label}</span>)}</div>

      {step === 0 && <div className="onboarding-body"><div className="onboarding-heading"><small>ETAPA 1 DE 4</small><h3>Dados da empresa</h3><p>Essas informações identificam a unidade e o responsável pela gestão.</p></div><div className="editor-fields">
        <label>Nome da empresa<input value={values.name} onChange={(event) => { const name = event.target.value; setValues((current) => ({ ...current, name, slug: current.slug ? current.slug : slugify(name) })); }} placeholder="Ex.: Studio Prime" autoFocus /></label>
        <label>Link público<div className="slug-input"><span>/agendar/</span><input value={values.slug} onChange={(event) => set("slug", slugify(event.target.value))} placeholder="studio-prime" /></div></label>
        <label>Cidade<input value={values.city} onChange={(event) => set("city", event.target.value)} placeholder="Itajaí · SC" /></label>
        <label>WhatsApp<input value={values.phone} onChange={(event) => set("phone", event.target.value)} placeholder="(47) 9 9999-9999" /></label>
        <label>E-mail do gestor<input type="email" value={values.ownerEmail} onChange={(event) => set("ownerEmail", event.target.value)} placeholder="gestor@empresa.com" /></label>
        <label>Senha inicial<input type="password" minLength={8} value={values.managerPassword} onChange={(event) => set("managerPassword", event.target.value)} placeholder="Mínimo de 8 caracteres" /></label>
        <label>Tipo de negócio<select value={values.businessType} onChange={(event) => set("businessType", event.target.value)}><option value="barbershop">Barbearia</option><option value="salon">Salão</option></select></label>
        <label>Plano<select value={values.plan} onChange={(event) => set("plan", event.target.value)}><option value="starter">Starter</option><option value="pro">Pro</option><option value="premium">Premium</option></select></label>
      </div></div>}

      {step === 1 && <div className="onboarding-body"><div className="onboarding-heading"><small>ETAPA 2 DE 4</small><h3>Identidade da empresa</h3><p>A logo e o tema aparecerão no link de agendamento enviado aos clientes.</p></div><label className="onboarding-logo"><span className={values.theme === "white" ? "white-preview" : ""}>{logo ? <img src={URL.createObjectURL(logo)} alt="Prévia da logo" /> : values.name.slice(0, 1) || "S"}</span><div><strong>{logo ? logo.name : "Adicionar logo"}</strong><small>PNG, JPG ou WebP · até 2 MB</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setLogo(event.target.files?.[0] || null)} /></div></label><div className="theme-choice"><span><strong>Tema do agendamento</strong><small>Escolha o fundo da página dos clientes.</small></span><button type="button" className={values.theme === "black" ? "selected" : ""} onClick={() => set("theme", "black")}><i className="black-swatch" /> Black</button><button type="button" className={values.theme === "white" ? "selected" : ""} onClick={() => set("theme", "white")}><i className="white-swatch" /> White</button></div><div className="link-preview"><small>LINK DO CLIENTE</small><strong>{window.location.origin}/agendar/{values.slug}</strong><span>O link ficará disponível após concluir o cadastro.</span></div></div>}

      {step === 2 && <div className="onboarding-body"><div className="onboarding-heading"><small>ETAPA 3 DE 4</small><h3>Primeiro serviço e profissional</h3><p>Uma configuração inicial para a agenda já abrir pronta.</p></div><div className="editor-fields">
        <label>Serviço<input value={values.serviceName} onChange={(event) => set("serviceName", event.target.value)} /></label>
        <label>Preço (R$)<input type="number" min="0" step="0.01" value={values.servicePrice} onChange={(event) => set("servicePrice", event.target.value)} /></label>
        <label>Duração (minutos)<input type="number" min="10" step="5" value={values.serviceDuration} onChange={(event) => set("serviceDuration", event.target.value)} /></label>
        <label>Nome do profissional<input value={values.professionalName} onChange={(event) => set("professionalName", event.target.value)} placeholder="Nome completo" /></label>
        <label>E-mail do profissional<input type="email" value={values.professionalEmail} onChange={(event) => set("professionalEmail", event.target.value)} placeholder="Opcional" /></label>
        <label>Horário de atendimento<div className="time-pair"><input type="time" value={values.open} onChange={(event) => set("open", event.target.value)} /><span>até</span><input type="time" value={values.close} onChange={(event) => set("close", event.target.value)} /></div></label>
      </div></div>}

      {step === 3 && <div className="onboarding-body"><div className="onboarding-heading"><small>ETAPA 4 DE 4</small><h3>Revisar e ativar</h3><p>Confira os dados antes de disponibilizar a nova empresa.</p></div><div className="onboarding-review">
        <article><small>EMPRESA</small><strong>{values.name}</strong><span>{values.businessType === "salon" ? "Salão" : "Barbearia"} · tema {values.theme} · plano {values.plan}</span></article>
        <article><small>GESTOR</small><strong>{values.ownerEmail}</strong><span>{values.phone}</span></article>
        <article><small>OPERAÇÃO INICIAL</small><strong>{values.serviceName} · R$ {Number(values.servicePrice).toFixed(2)}</strong><span>{values.professionalName} · {values.open} às {values.close}</span></article>
        <article><small>LINK DO CLIENTE</small><strong>/agendar/{values.slug}</strong><span>Pronto para compartilhar</span></article>
      </div><label className="activation-choice"><input type="checkbox" checked={values.active} onChange={(event) => set("active", event.target.checked)} /><span><strong>Ativar ao concluir</strong><small>Desmarque para salvar a empresa como rascunho.</small></span></label></div>}

      {notice && <p className="editor-error">{notice}</p>}
      <footer className="onboarding-actions"><button type="button" className="outline-button" onClick={step ? () => setStep(step - 1) : onClose}>{step ? "Voltar" : "Cancelar"}</button>{step < 3 ? <button type="button" className="gold-button compact" disabled={!validStep} onClick={() => setStep(step + 1)}>Continuar</button> : <button type="button" className="gold-button compact" disabled={saving} onClick={submit}>{saving ? "Configurando..." : values.active ? "Criar e ativar" : "Salvar rascunho"}</button>}</footer>
    </section>
  </div>;
}

function LegacyMasterContent() {
  return <div className="dashboard"><div className="metric-grid">{[
    ["BARBEARIAS ATIVAS", "24", "+ 3 este mês", Store],
    ["RECEITA RECORRENTE", "R$ 2.184", "+ 12% este mês", ChartNoAxesCombined],
    ["ASSINATURAS", "21", "3 em teste grátis", CreditCard],
    ["AGENDAMENTOS", "8.492", "Últimos 30 dias", CalendarDays],
  ].map(([l, v, n, MetricIcon]) => <article className="metric" key={String(l)}><span>{l}</span><i><MetricIcon aria-hidden="true" /></i><strong>{v}</strong><small>{n}</small></article>)}</div><div className="dashboard-grid master-grid"><section className="panel tenant-list"><header><div><h2>Estabelecimentos recentes</h2><p>Negócios cadastrados na plataforma</p></div><button>Ver todos →</button></header>{[["Barbearia Vértice", "Baln. Camboriú · SC", "Pro", "Ativa"], ["Maison Aurora", "Florianópolis · SC", "Premium", "Ativa"], ["Bella Luna Studio", "Joinville · SC", "Starter", "Teste"]].map(([n, city, plan, status]) => <div className="tenant" key={n}><span className="workspace-icon">{n[0]}</span><span><strong>{n}</strong><small>{city}</small></span><b>{plan}</b><i className={status === "Teste" ? "waiting status" : "status"}>{status}</i><button>•••</button></div>)}</section><section className="panel plans"><header><div><h2>Distribuição por plano</h2><p>Assinaturas ativas</p></div></header>{[["Pro", 14, "67%"], ["Starter", 6, "29%"], ["Premium", 1, "4%"]].map(([n, q, p]) => <div className="plan-row" key={n}><span><strong>{n}</strong><small>{q} empresas</small></span><b>{p}</b><div><i style={{width: p}} /></div></div>)}</section></div></div>;
}

function InventoryContent({ tenantId }: { tenantId: string }) {
  type Product = { id: number; name: string; category: string; quantity: number; minimumStock: number; cost: number; salePrice: number };
  const [products, setProducts] = useState<Product[]>([]);
  const [notice, setNotice] = useState("Carregando estoque...");
  const load = () => fetch(`/api/inventory?tenant=${encodeURIComponent(tenantId)}`).then(async (r) => {
    const data = await r.json(); if (!r.ok) throw new Error(data.error); setProducts(data.products || []); setNotice("");
  }).catch((e) => setNotice(e.message || "Não foi possível carregar o estoque."));
  useEffect(() => { load(); }, [tenantId]);
  useAutoRefresh(load);
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/inventory?tenant=${encodeURIComponent(tenantId)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
    if (response.ok) { event.currentTarget.reset(); load(); } else setNotice((await response.json()).error);
  }
  async function adjust(id: number, delta: number) {
    await fetch(`/api/inventory?tenant=${encodeURIComponent(tenantId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, delta }) }); load();
  }
  async function remove(product: Product) {
    if (!window.confirm(`Excluir ${product.name} do estoque?`)) return;
    await fetch(`/api/inventory?tenant=${encodeURIComponent(tenantId)}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: product.id }) }); load();
  }
  const low = products.filter((p) => p.quantity <= p.minimumStock).length;
  const value = products.reduce((sum, p) => sum + p.quantity * p.cost, 0);
  return <div className="inventory-page"><div className="settings-intro"><div><span className="section-kicker">PRODUTOS E INSUMOS</span><h2>Controle de estoque</h2><p>Acompanhe pomadas, shampoos, lâminas e produtos para venda.</p></div></div>
    <div className="inventory-metrics"><article><small>PRODUTOS</small><strong>{products.length}</strong></article><article><small>ESTOQUE BAIXO</small><strong>{low}</strong></article><article><small>VALOR EM ESTOQUE</small><strong>{formatMoney(value / 100)}</strong></article></div>
    <form className="panel inventory-form" onSubmit={add}><input name="name" required placeholder="Nome do produto" /><input name="category" placeholder="Categoria" /><input name="quantity" type="number" min="0" placeholder="Quantidade" /><input name="minimumStock" type="number" min="0" placeholder="Estoque mínimo" /><input name="cost" type="number" min="0" step=".01" placeholder="Custo R$" /><input name="salePrice" type="number" min="0" step=".01" placeholder="Venda R$" /><button className="gold-button compact">Adicionar produto</button></form>
    <section className="panel inventory-list"><div className="inventory-head"><span>PRODUTO</span><span>QUANTIDADE</span><span>MÍNIMO</span><span>CUSTO</span><span>VENDA</span><span>AÇÕES</span></div>{products.map((p) => <div className={`inventory-row ${p.quantity <= p.minimumStock ? "low" : ""}`} key={p.id}><span><strong>{p.name}</strong><small>{p.category}</small></span><span className="stock-adjust"><button onClick={() => adjust(p.id, -1)}>−</button><b>{p.quantity}</b><button onClick={() => adjust(p.id, 1)}>+</button></span><b>{p.minimumStock}</b><span>{formatMoney(p.cost / 100)}</span><span>{formatMoney(p.salePrice / 100)}</span><button className="owner-delete" onClick={() => remove(p)}>Excluir</button></div>)}{!products.length && <div className="agenda-empty">{notice || "Nenhum produto cadastrado."}</div>}</section>
  </div>;
}

function Footer() {
  return <footer><div className="shell"><Logo /><p>O sistema operacional do seu negócio.</p><span>© 2026 SalonOS</span></div></footer>;
}


