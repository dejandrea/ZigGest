import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import Icon from "../components/Icon";
import FinancialOperationForm from "../components/FinancialOperationForm";
import AccountEditor from "../components/AccountEditor";
import "../styles/pages/Users.css";
import "../styles/pages/Contas.css";
import "../styles/pages/ResumoContas.css";
const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 6,
});
import { sumMoney, subtractMoney, moneyUnits, moneyText } from "../services/decimalMoney";
const pageSize = 50;
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Bahia" });
const dateKeyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit",
});
export function ledgerSummary(rows) {
  const debit = sumMoney(
    rows.filter((r) => r.tipo === "debito").map((r) => r.valor),
  );
  const credit = sumMoney(
    rows.filter((r) => r.tipo === "credito").map((r) => r.valor),
  );
  return { debit, credit, balance: subtractMoney(debit, credit) };
}
export function accountDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : dateFormatter.format(date);
}
function dateKey(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = dateKeyFormatter.formatToParts(date);
  return ["year", "month", "day"]
    .map((key) => parts.find((p) => p.type === key).value)
    .join("-");
}
export default function Contas() {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [view, setView] = useState("customers");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState(null);
  const [search, setSearch] = useState(""),
    [type, setType] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/contas");
      setRows(data);
      setLoaded(true);
    } catch {
      setError(
        "Não foi possível carregar os lançamentos. Tente atualizar a lista.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    api
      .get("/contas")
      .then(({ data }) => {
        if (active) {
          setRows(data);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Não foi possível carregar os lançamentos. Tente atualizar a lista.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const ordered = useMemo(
    () =>
      rows.map(row => {
        const time = Date.parse(row.dataLancamento || row.createdAt || "");
        return { ...row, sortTime: Number.isFinite(time) ? time : 0,
          searchText: [row.clienteNome, row.clienteApelido, row.codigoCliente, row.codigoConta].join(" ").toLocaleLowerCase("pt-BR"),
          dueDay: dateKey(row.dataVencimento) };
      }).sort((a, b) => {
        return (
          b.sortTime - a.sortTime || Number(b.codigoConta) - Number(a.codigoConta)
        );
      }),
    [rows],
  );
  const filtered = useMemo(
    () => {
      const query = search.trim().toLocaleLowerCase("pt-BR");
      return ordered.filter((row) => {
        const day = row.dueDay;
        return (
          row.searchText.includes(query) &&
          (selectedCustomer === null || row.codigoCliente === selectedCustomer) &&
          (type === "all" || row.tipo === type) &&
          (!from || (day && day >= from)) &&
          (!to || (day && day <= to))
        );
      });
    },
    [ordered, search, type, from, to, selectedCustomer],
  );
  const totals = useMemo(() => ledgerSummary(rows), [rows]);
  const visible = useMemo(() => ledgerSummary(filtered), [filtered]);
  const customers = useMemo(() => {
    // Entries are newest first, so each customer's latest entry defines its position.
    const groups = new Map();
    for (const row of filtered) {
      if (!groups.has(row.codigoCliente)) groups.set(row.codigoCliente, {
        codigoCliente: row.codigoCliente, nome: row.clienteNome, apelido: row.clienteApelido,
        debit: 0n, credit: 0n, count: 0,
      });
      const group = groups.get(row.codigoCliente);
      group[row.tipo === "credito" ? "credit" : "debit"] += moneyUnits(row.valor, true);
      group.count++;
    }
    return [...groups.values()].map(group => ({...group,
      debit: Number(moneyText(group.debit)), credit: Number(moneyText(group.credit)),
      balance: Number(moneyText(group.debit - group.credit)),
    }));
  }, [filtered]);
  const listRows = view === "customers" ? customers : filtered;
  const pageCount = Math.max(1, Math.ceil(listRows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = listRows.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  useEffect(() => { setPage(0); }, [search, type, from, to, view, selectedCustomer]);
  function statement(customerCode) {
    setSelectedCustomer(customerCode);
    setView("entries");
  }
  function open(row) {
    setEditor(row);
    setNotice("");
  }
  function saved(message) {
    setSettlement(null);
    setEditor(null);
    setNotice(message);
    load();
  }
  const invalidRange = from && to && from > to;
  return (
    <div className="users-page accounts-page">
      <header className="users-heading">
        <div>
          <p className="home-eyebrow">FINANCEIRO</p>
          <h1>Contas a receber</h1>
          <p>Acompanhe os débitos, créditos e o saldo dos seus clientes.</p>
        </div>
        <div className="accounts-heading-actions">
          <button
            className="users-secondary"
            onClick={() => navigate("/resumo")}
          >
            Resumo por cliente <span aria-hidden="true">↗</span>
          </button>
          <button className="users-primary" onClick={() => open({})}>
            + Novo lançamento
          </button>
        </div>
      </header>
      {error && (
        <p className="users-message users-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="users-message users-success" role="status">
          {notice}
        </p>
      )}
      <div
        className="users-stats accounts-stats"
        aria-label="Resumo financeiro"
      >
        {[
          ["Total de débitos", totals.debit, "debit"],
          ["Total de créditos", totals.credit, "credit"],
          ["Saldo Devedor", totals.balance, "balance"],
        ].map(([label, value, kind]) => (
          <div className={"accounts-stat " + kind} key={kind}>
            <div>
              <span>{label}</span>
              <Icon name="money" />
            </div>
            <strong>{loaded ? currency.format(value) : "—"}</strong>
            <small>
              {kind === "balance"
                ? "Débitos menos créditos"
                : "Todos os lançamentos cadastrados"}
            </small>
          </div>
        ))}
      </div>
      <div className="users-workspace">
        <section
          className="users-list accounts-list"
          aria-label="Lista de lançamentos"
          aria-busy={loading}
        >
          <div className="accounts-list-heading">
            <div>
              <h2>{view === "customers" ? "Saldos por cliente" : "Extrato de lançamentos"}</h2>
              <p>{view === "customers" ? "Saldos calculados a partir dos débitos e créditos." : "Do lançamento mais recente para o mais antigo."}</p>
            </div>
            <button
              className="users-secondary"
              onClick={load}
              disabled={loading}
            >
              Atualizar
            </button>
          </div>
          <div className="summary-tabs" role="group" aria-label="Visualização das contas a receber">
            <button aria-pressed={view === "customers"} onClick={() => { setView("customers"); setSelectedCustomer(null); }}>Por cliente</button>
            <button aria-pressed={view === "entries"} onClick={() => setView("entries")}>Extrato</button>
          </div>
          <div className="users-toolbar accounts-toolbar">
            <div className="users-search">
              <Icon name="clients" />
              <input
                aria-label="Buscar lançamentos"
                placeholder="Cliente ou código do lançamento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              aria-label="Tipo de lançamento"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="all">Todos os tipos</option>
              <option value="debito">Débitos</option>
              <option value="credito">Créditos</option>
            </select>
            <div className="accounts-date-filter">
              <label htmlFor="accounts-from">Vencimento de</label>
              <input
                id="accounts-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="accounts-date-filter">
              <label htmlFor="accounts-to">Até</label>
              <input
                id="accounts-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            {(search || type !== "all" || from || to || selectedCustomer !== null) && (
              <button
                className="users-edit"
                onClick={() => {
                  setSearch("");
                  setType("all");
                  setFrom("");
                  setTo("");
                  setSelectedCustomer(null);
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
          {invalidRange && (
            <p className="accounts-filter-error" role="alert">
              A data inicial deve ser anterior ou igual à data final.
            </p>
          )}
          <div className="users-table-wrap">
            <table>
              <thead>
                {view === "customers" ? (
                  <tr><th>Cliente</th><th>Lançamentos</th><th>Débitos</th><th>Créditos</th><th>Saldo Devedor</th><th><span className="users-sr-only">Ações</span></th></tr>
                ) : (
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Saldo do título</th>
                  <th>
                    <span className="users-sr-only">Ações</span>
                  </th>
                </tr>
                )}
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={view === "customers" ? 6 : 7} className="users-empty">
                      <span role="status">Carregando lançamentos…</span>
                    </td>
                  </tr>
                ) : !loaded ? (
                  <tr>
                    <td colSpan={view === "customers" ? 6 : 7} className="users-empty">
                      A lista está indisponível. Clique em Atualizar para tentar
                      novamente.
                    </td>
                  </tr>
                ) : !filtered.length ? (
                  <tr>
                    <td colSpan={view === "customers" ? 6 : 7} className="users-empty">
                      {rows.length
                        ? "Nenhum lançamento corresponde aos filtros."
                        : "Nenhum lançamento cadastrado. Registre o primeiro lançamento para começar."}
                    </td>
                  </tr>
                ) : view === "customers" ? (
                  pageRows.map(customer => (
                    <tr key={customer.codigoCliente}>
                      <td><div className="accounts-customer"><strong>{customer.nome}</strong><span>#{customer.codigoCliente}{customer.apelido?.trim() ? " · " + customer.apelido.trim() : ""}</span></div></td>
                      <td>{customer.count}</td>
                      <td className="accounts-money">{currency.format(customer.debit)}</td>
                      <td className="accounts-money credito">{currency.format(customer.credit)}</td>
                      <td><span className={"summary-balance " + (customer.balance > 0 ? "owed" : customer.balance < 0 ? "in-credit" : "settled")}>{currency.format(customer.balance)}</span></td>
                      <td><button className="users-edit" aria-label={"Ver extrato de " + customer.nome} onClick={() => statement(customer.codigoCliente)}>Ver extrato <span aria-hidden="true">↗</span></button></td>
                    </tr>
                  ))
                ) : (
                  pageRows.map((row) => (
                    <tr
                      key={row.codigoConta}
                      className={
                        editor?.codigoConta === row.codigoConta
                          ? "is-selected"
                          : ""
                      }
                    >
                      <td className="accounts-code">
                        #{String(row.codigoConta).padStart(4, "0")}
                      </td>
                      <td>
                        <div className="accounts-customer">
                          <strong>{row.clienteNome}</strong>
                          <span>#{row.codigoCliente}{row.clienteApelido?.trim() ? " · " + row.clienteApelido.trim() : ""}</span>
                        </div>
                      </td>
                      <td>
                        <span className={"accounts-type " + row.tipo}>
                          {row.tipo === "credito" ? "Crédito" : "Débito"}
                        </span>
                      </td>
                      <td className={"accounts-money " + row.tipo}>
                        {currency.format(row.valor)}
                      </td>
                      <td>{accountDate(row.dataVencimento)}</td>
                      <td className={row.tipo === "debito" && !row.financeOperationId && (row.aberto ?? row.valor) > 0 ? "accounts-debt" : ""}>
                        {row.financeOperationId
                          ? "Movimentação financeira"
                          : currency.format(row.aberto ?? row.valor)}
                      </td>
                      <td>
                        <button
                          className="users-edit"
                          aria-label={"Editar lançamento " + row.codigoConta}
                          disabled={row.locked}
                          onClick={() => open(row)}
                        >
                          Editar <span aria-hidden="true">↗</span>
                        </button>
                        {row.tipo === "debito" &&
                          !row.financeOperationId &&
                          (row.aberto ?? row.valor) > 0 && (
                            <>
                              <div>
                                <button
                                  className="users-edit"
                                  aria-label={
                                    "Receber lançamento " + row.codigoConta
                                  }
                                  onClick={() =>
                                    setSettlement({
                                      tipo: "RECEIPT",
                                      debitoId: row._id,
                                      categoriaId: row.categoriaId ?? "",
                                      valor: String(
                                        Math.min(
                                          row.aberto ?? row.valor,
                                          row.saldoCliente ?? row.valor,
                                        ),
                                      ),
                                      maxValue: Math.max(
                                        0,
                                        Math.min(
                                          row.aberto ?? row.valor,
                                          row.saldoCliente ?? row.valor,
                                        ),
                                      ),
                                      descricao:
                                        "Recebimento: " +
                                        row.clienteNome +
                                        " #" +
                                        row.codigoConta,
                                    })
                                  }
                                >
                                  Receber
                                </button>
                              </div>
                            </>
                          )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {loaded && !loading && pageCount > 1 && (
            <nav className="accounts-pagination" aria-label="Paginação de lançamentos">
              <button className="users-secondary" disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}>Anterior</button>
              <span>Página {currentPage + 1} de {pageCount}</span>
              <button className="users-secondary" disabled={currentPage === pageCount - 1}
                onClick={() => setPage(currentPage + 1)}>Próxima</button>
            </nav>
          )}
          <footer className="users-list-footer">
            <span>
              {loaded && !loading
                ? (view === "customers" ? customers.length + " clientes · " : "") + filtered.length + " de " + rows.length + " lançamentos"
                : "Consulta de lançamentos"}
            </span>
            <span className="accounts-filtered-total">
              {loaded && !loading
                ? "Saldo da seleção: " + currency.format(visible.balance)
                : ""}
            </span>
          </footer>
        </section>
        {settlement && (
          <FinancialOperationForm
            initialValues={settlement}
            onClose={() => setSettlement(null)}
            onSuccess={saved}
          />
        )}
        {editor && (
          <AccountEditor
            key={editor.codigoConta || "new"}
            conta={editor.codigoConta ? editor : null}
            onClose={() => setEditor(null)}
            onSuccess={saved}
          />
        )}
      </div>
      <p className="users-bottom-note">
        Registre débitos e créditos para ajustar o saldo do cliente.
        Receber registra dinheiro na conta financeira e reduz a dívida.
        Lançamentos vinculados ao financeiro são
        protegidos; corrija por estorno no extrato.
      </p>
    </div>
  );
}
