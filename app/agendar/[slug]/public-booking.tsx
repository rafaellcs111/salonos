"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { MessageCircle } from "lucide-react";

type Storefront = {
  tenant: { id: string; name: string; slug: string; city: string; phone: string; logoUrl: string | null; businessType: "salon" | "barbershop"; theme: "black" | "white" };
  services: { name: string; price: number; duration: number }[];
  barbers: {
    name: string;
    services: string[];
    workDays: string[];
    workStart: string;
    workEnd: string;
    breakStart: string;
    breakEnd: string;
    timeOff: { start: string; end: string; label: string }[];
  }[];
  hours: { label: string; days: string; open: string; close: string }[];
};

export default function PublicBooking({ slug }: { slug: string }) {
  const [store, setStore] = useState<Storefront | null>(null);
  const [error, setError] = useState("");
  const [service, setService] = useState("");
  const [barber, setBarber] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [booked, setBooked] = useState<string[]>([]);
  const [occupied, setOccupied] = useState<{ time: string; duration: number }[]>([]);
  const [success, setSuccess] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/storefront/${encodeURIComponent(slug)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data: Storefront) => {
        setStore(data);
        setService(data.services[0]?.name || "");
        setBarber(data.barbers[0]?.name || "");
      })
      .catch(() => setError("Esta empresa não está disponível para agendamentos."));
  }, [slug]);

  const selectedService = store?.services.find((item) => item.name === service);
  const eligibleBarbers = useMemo(() => store?.barbers.filter((item) =>
    !item.services?.length || item.services.includes(service),
  ) || [], [service, store]);
  const selectedBarber = eligibleBarbers.find((item) => item.name === barber);

  useEffect(() => {
    if (!eligibleBarbers.some((item) => item.name === barber)) {
      setBarber(eligibleBarbers[0]?.name || "");
      setTime("");
    }
  }, [barber, eligibleBarbers]);

  const dates = useMemo(() => {
    if (!store || !selectedBarber) return [];
    const result: Date[] = [];
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    for (let offset = 0; offset < 21 && result.length < 5; offset += 1) {
      const candidate = new Date(today);
      candidate.setDate(today.getDate() + offset);
      const iso = localDate(candidate);
      const businessOpen = store.hours.some((hours) => hours.days.split(",").includes(String(candidate.getDay())));
      const professionalWorks = selectedBarber.workDays.includes(String(candidate.getDay()));
      const away = selectedBarber.timeOff.some((period) => period.start <= iso && period.end >= iso);
      if (businessOpen && professionalWorks && !away) result.push(candidate);
    }
    return result;
  }, [selectedBarber, store]);

  useEffect(() => {
    if (!date && dates[0]) setDate(localDate(dates[0]));
  }, [date, dates]);

  useEffect(() => {
    if (!store || !date || !barber) return;
    setTime("");
    fetch(`/api/appointments?availability=1&tenant=${encodeURIComponent(store.tenant.id)}&date=${date}&barber=${encodeURIComponent(barber)}`)
      .then((response) => response.ok ? response.json() : { booked: [] })
      .then((data) => {
        setBooked(data.booked || []);
        setOccupied(data.occupied || []);
      })
      .catch(() => {
        setBooked([]);
        setOccupied([]);
      });
  }, [barber, date, store]);

  const slots = useMemo(() => {
    if (!store || !selectedService || !selectedBarber || !date) return [];
    const weekday = new Date(`${date}T12:00:00`).getDay();
    const schedule = store.hours.find((item) => item.days.split(",").includes(String(weekday)));
    if (!schedule) return [];
    const start = Math.max(toMinutes(schedule.open), toMinutes(selectedBarber.workStart || schedule.open));
    const end = Math.min(toMinutes(schedule.close), toMinutes(selectedBarber.workEnd || schedule.close));
    const breakStart = selectedBarber.breakStart ? toMinutes(selectedBarber.breakStart) : -1;
    const breakEnd = selectedBarber.breakEnd ? toMinutes(selectedBarber.breakEnd) : -1;
    const duration = Math.max(15, Number(selectedService.duration) || 30);
    const result: string[] = [];
    for (let minute = start; minute + duration <= end; minute += duration) {
      const slot = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      const overlapsBreak = breakStart >= 0 && breakEnd > breakStart && minute < breakEnd && minute + duration > breakStart;
      const overlapsAppointment = occupied.some((entry) => {
        const occupiedStart = toMinutes(entry.time);
        return minute < occupiedStart + Number(entry.duration || 30) && minute + duration > occupiedStart;
      });
      if (!booked.includes(slot) && !overlapsBreak && !overlapsAppointment) result.push(slot);
    }
    return result;
  }, [booked, date, occupied, selectedBarber, selectedService, store]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!store || !service || !barber || !date || !time) {
      setError("Escolha serviço, profissional, data e horário.");
      return;
    }
    const form = new FormData(event.currentTarget);
    setSending(true);
    setError("");
    const response = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant: store.tenant.id, customerName: form.get("name"), phone: form.get("phone"), service, barber, date, time }),
    });
    setSending(false);
    if (response.ok) {
      setSuccess(true);
      return;
    }
    const data = await response.json().catch(() => null);
    setError(data?.error || "Não foi possível confirmar o agendamento.");
  }

  if (error && !store) return <main className="public-booking unavailable"><div><span className="chosen-mark">B</span><h1>Agenda indisponível</h1><p>{error}</p></div></main>;
  if (!store) return <main className="public-booking unavailable"><div><span className="chosen-mark">B</span><h1>Carregando agenda...</h1></div></main>;
  if (success) {
    const message = `Olá! Acabei de agendar ${service} com ${barber} para ${formatDate(date)}, às ${time}. Meu nome é o informado no agendamento.`;
    return <main className={`public-booking theme-${store.tenant.theme}`}><section className="public-success"><span className="success-icon">✓</span><span className="section-kicker">AGENDAMENTO CONFIRMADO</span><h1>Nos vemos em breve!</h1><p>{service} com {barber}, dia {formatDate(date)} às {time}.</p><div><strong>{store.tenant.name}</strong><small>{store.tenant.city} · {store.tenant.phone}</small></div><a className="whatsapp-button full" href={whatsappUrl(store.tenant.phone, message)} target="_blank" rel="noreferrer"><MessageCircle aria-hidden="true" /> Confirmar pelo WhatsApp</a><button className="outline-button full" onClick={() => window.location.reload()}>Fazer outro agendamento</button></section></main>;
  }

  return <main className={`public-booking theme-${store.tenant.theme}`}><header><div className="public-brand">{store.tenant.logoUrl ? <img className="tenant-public-logo" src={store.tenant.logoUrl} alt={`Logo ${store.tenant.name}`} /> : <span className="chosen-mark">{store.tenant.name[0]}</span>}<span><strong>{store.tenant.name}</strong><small>{store.tenant.businessType === "salon" ? "Salão" : "Barbearia"} · {store.tenant.city}</small></span></div><span>Agendamento online por SalonOS</span></header>
    <form className="public-booking-card" onSubmit={submit}>
      <div className="public-heading"><span className="section-kicker">AGENDE SEU HORÁRIO</span><h1>Escolha seu atendimento</h1><p>Confirmação imediata, sem pagamento online.</p></div>
      <fieldset><legend>1. Serviço</legend><div className="public-options">{store.services.map((item) => <button type="button" key={item.name} className={service === item.name ? "selected" : ""} onClick={() => setService(item.name)}><span><strong>{item.name}</strong><small>{item.duration} min</small></span><b>R$ {item.price}</b></button>)}</div></fieldset>
      <fieldset><legend>2. Profissional</legend><div className="public-options compact">{eligibleBarbers.map((item) => <button type="button" key={item.name} className={barber === item.name ? "selected" : ""} onClick={() => setBarber(item.name)}><span className="avatar">{item.name[0]}</span><strong>{item.name}</strong></button>)}</div>{!eligibleBarbers.length && <p className="empty-message">Nenhum profissional atende este serviço no momento.</p>}</fieldset>
      <fieldset><legend>3. Data e horário</legend><div className="public-dates">{dates.map((item) => { const value = localDate(item); return <button type="button" className={date === value ? "selected" : ""} key={value} onClick={() => setDate(value)}><small>{item.toLocaleDateString("pt-BR", { weekday: "short" })}</small><strong>{item.getDate()}</strong></button>; })}</div><div className="public-times">{slots.map((slot) => <button type="button" className={time === slot ? "selected" : ""} key={slot} onClick={() => setTime(slot)}>{slot}</button>)}</div></fieldset>
      <fieldset><legend>4. Seus dados</legend><div className="customer-fields"><label>Nome completo<input name="name" required minLength={3} /></label><label>WhatsApp<input name="phone" required minLength={8} /></label></div></fieldset>
      {error && <p className="error">{error}</p>}<button className="gold-button full" disabled={sending || !time}>{sending ? "Confirmando..." : "Confirmar agendamento →"}</button>
    </form>
  </main>;
}

function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

function toMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function whatsappUrl(phone: string, message: string) {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
