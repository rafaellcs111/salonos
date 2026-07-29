import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export default async function BarbershopDirectory() {
  const result = await env.DB.prepare(
    `SELECT id, name, slug, city, logo_key AS logoKey
     FROM tenants WHERE active = 1 ORDER BY name`,
  ).all();
  const tenants = result.results;

  return <main className="directory-page">
    <header className="directory-header"><a href="/"><img src="/salonos-logo.png" alt="SalonOS" /></a><span>Agendamento online</span></header>
    <section className="directory-hero"><span className="section-kicker">ESCOLHA ONDE SER ATENDIDO</span><h1>Encontre sua barbearia</h1><p>Cada estabelecimento possui agenda, profissionais e serviços próprios.</p></section>
    <section className="directory-grid">
      {tenants.map((tenant) => <a className="directory-card" href={`/agendar/${tenant.slug}`} key={String(tenant.id)}>
        {tenant.logoKey ? <img src={`/api/tenant-logo?tenant=${encodeURIComponent(String(tenant.id))}`} alt="" /> : <span>{String(tenant.name)[0]}</span>}
        <div><strong>{String(tenant.name)}</strong><small>{String(tenant.city)}</small><b>Ver horários →</b></div>
      </a>)}
      {!tenants.length && <div className="directory-empty">Nenhuma barbearia está disponível neste momento.</div>}
    </section>
  </main>;
}
