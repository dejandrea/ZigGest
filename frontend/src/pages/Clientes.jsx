import { formatPhone } from "../utils/contactMasks";
import React, { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import Icon from "../components/Icon";
import ModalNovoCliente from "../components/ModalNovoCliente";
import ModalEditarCliente from "../components/ModalEditarCliente";
import "../styles/pages/Users.css";
import "../styles/pages/Clientes.css";
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
export default function Clientes() {
  const [rows, setRows] = useState([]),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false),
    [selected, setSelected] = useState(null);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/clientes");
      setRows(data);
      setLoaded(true);
    } catch {
      setError(
        "Não foi possível carregar os clientes. Tente atualizar a lista.",
      );
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    api
      .get("/clientes")
      .then(({ data }) => {
        if (active) {
          setRows(data);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (active)
          setError(
            "Não foi possível carregar os clientes. Tente atualizar a lista.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const filtered = useMemo(
    () =>
      rows
        .filter((c) => {
          const term = search.trim().toLocaleLowerCase("pt-BR");
          return (
            [
              c.nome,
              c.apelido,
              c.codigoCliente,
              c.telefone,
              formatPhone(c.telefone),
              c.email,
            ]
              .join(" ")
              .toLocaleLowerCase("pt-BR")
              .includes(term) &&
            (filter === "all" ||
              (filter === "active" && c.ativo) ||
              (filter === "inactive" && !c.ativo) ||
              (filter === "blocked" && c.status === "bloqueado"))
          );
        })
        .sort((a, b) => Number(b.codigoCliente) - Number(a.codigoCliente)),
    [rows, search, filter],
  );
  function saved(message, keepOpen) {
    if (!keepOpen) setCreating(false);
    setSelected(null);
    setNotice(message);
    load();
  }
  return (
    <div className="users-page customers-page">
      <header className="users-heading">
        <div>
          <p className="home-eyebrow">CADASTROS</p>
          <h1>Clientes</h1>
          <p>Mantenha os dados dos seus clientes organizados e sempre à mão.</p>
        </div>
        <button
          className="users-primary"
          onClick={() => {
            setCreating(true);
            setNotice("");
          }}
        >
          + Novo cliente
        </button>
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
      <div className="users-stats" aria-label="Resumo dos clientes">
        {[
          ["Clientes cadastrados", rows.length],
          ["Clientes ativos", rows.filter((c) => c.ativo).length],
          [
            "Clientes bloqueados",
            rows.filter((c) => c.status === "bloqueado").length,
          ],
        ].map(([label, count]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{loaded ? count : "—"}</strong>
          </div>
        ))}
      </div>
      <section
        className="users-list customers-list"
        aria-label="Lista de clientes"
        aria-busy={loading}
      >
        <div className="customers-list-heading">
          <div>
            <h2>Seus clientes</h2>
            <p>Cadastros mais recentes aparecem primeiro.</p>
          </div>
          <button className="users-secondary" onClick={load} disabled={loading}>
            Atualizar
          </button>
        </div>
        <div className="users-toolbar">
          <div className="users-search">
            <Icon name="clients" />
            <input
              aria-label="Buscar clientes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nome, apelido ou código"
            />
          </div>
          <select
            aria-label="Filtrar clientes"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Todos os clientes</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
            <option value="blocked">Bloqueados</option>
          </select>
          {(search || filter !== "all") && (
            <button
              className="users-edit"
              onClick={() => {
                setSearch("");
                setFilter("all");
              }}
            >
              Limpar filtros
            </button>
          )}
        </div>
        <div className="users-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contato</th>
                <th>Limite</th>
                <th>Status financeiro</th>
                <th>Cadastro</th>
                <th>
                  <span className="users-sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="users-empty" colSpan="6">
                    <span role="status">Carregando clientes…</span>
                  </td>
                </tr>
              ) : !loaded ? (
                <tr>
                  <td className="users-empty" colSpan="6">
                    Lista indisponível. Clique em Atualizar para tentar
                    novamente.
                  </td>
                </tr>
              ) : !filtered.length ? (
                <tr>
                  <td className="users-empty" colSpan="6">
                    {rows.length
                      ? "Nenhum cliente corresponde aos filtros."
                      : "Nenhum cliente cadastrado. Comece adicionando um novo cliente."}
                  </td>
                </tr>
              ) : (
                filtered.map((c) => (
                  <tr key={c.codigoCliente}>
                    <td>
                      <div className="users-person">
                        <span className="users-avatar" aria-hidden="true">
                          {c.nome?.trim()[0]?.toUpperCase() || "C"}
                        </span>
                        <div>
                          <strong>{c.nome}</strong>
                          <span>
                            #{String(c.codigoCliente).padStart(4, "0")}
                            {c.apelido ? " · " + c.apelido : ""}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="customers-contact">
                        <strong>
                          {formatPhone(c.telefone) || "Sem telefone"}
                        </strong>
                        <span>{c.email || "Sem e-mail"}</span>
                      </div>
                    </td>
                    <td className="customers-limit">
                      {money.format(Number(c.limite) || 0)}
                    </td>
                    <td>
                      <span
                        className={
                          "customers-financial " +
                          (c.status === "bloqueado" ? "blocked" : "released")
                        }
                      >
                        {c.status === "bloqueado" ? "Bloqueado" : "Liberado"}
                      </span>
                    </td>
                    <td>
                      <span
                        className={
                          "users-status " +
                          (c.ativo ? "is-active" : "is-inactive")
                        }
                      >
                        <i aria-hidden="true" />
                        {c.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="users-edit"
                        aria-label={"Editar cliente " + c.nome}
                        onClick={() => {
                          setSelected(c);
                          setNotice("");
                        }}
                      >
                        Editar <span aria-hidden="true">↗</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <footer className="users-list-footer">
          <span>
            {loaded && !loading
              ? filtered.length + " de " + rows.length + " clientes"
              : "Consulta de clientes"}
          </span>
          <span>Dados e limites de crédito</span>
        </footer>
      </section>
      <div className="customers-note">
        <Icon name="clients" />
        <p>
          <strong>Cadastro e status financeiro são diferentes.</strong>
          <br />
          Clientes inativos não recebem novos lançamentos. O bloqueio financeiro
          impede novos débitos; créditos continuam permitidos para clientes
          ativos.
        </p>
      </div>
      {creating && (
        <ModalNovoCliente
          onClose={() => setCreating(false)}
          onSuccess={(_data, keepOpen) =>
            saved("Cliente cadastrado com sucesso.", keepOpen)
          }
        />
      )}
      {selected && (
        <ModalEditarCliente
          cliente={selected}
          onClose={() => setSelected(null)}
          onSuccess={(message) =>
            saved(message || "Operacao concluida com sucesso.")
          }
        />
      )}
    </div>
  );
}
