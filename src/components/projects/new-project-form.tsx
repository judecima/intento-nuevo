"use client";

import { useState } from "react";
import { PendingSubmitButton } from "@/components/forms/pending-submit-button";
import { BoardPicker, type BoardMaterialOption } from "@/components/materials/board-picker";
import { MaterialImage } from "@/components/materials/material-image";
import { createProjectAction } from "@/lib/projects/actions";
import type { CustomerOption } from "@/lib/customers/queries";
import type { MachineCutSettings } from "@/lib/production/queries";

export function NewProjectForm({
  materials,
  organizationId,
  customers = [],
  requiresCustomer = false,
  machineSettings
}: {
  materials: BoardMaterialOption[];
  /** Presente solo cuando el super usuario crea para otra organizacion. */
  organizationId?: string;
  customers?: CustomerOption[];
  requiresCustomer?: boolean;
  machineSettings: MachineCutSettings;
}) {
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [name, setName] = useState("");
  const [nameEdited, setNameEdited] = useState(false);
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "");

  const selected = materials.find((material) => material.id === materialId) ?? null;
  // Mientras el usuario no escriba un nombre, sigue al tablero elegido.
  const suggestedName = selected ? `Proyecto ${selected.code?.trim() || selected.description}`.slice(0, 120) : "";
  const nameValue = nameEdited ? name : suggestedName;

  if (materials.length === 0) {
    return (
      <div className="empty-state">
        <strong>No hay tableros en el catalogo</strong>
        Importa el catalogo de materiales antes de crear un proyecto.
      </div>
    );
  }

  return (
    <form action={createProjectAction} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <input type="hidden" name="materialId" value={materialId} />
      {organizationId ? <input type="hidden" name="organizationId" value={organizationId} /> : null}
      {requiresCustomer && customerId ? <input type="hidden" name="customerId" value={customerId} /> : null}

      <div className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow-muted">Paso 1</div>
            <h2 className="mt-1 text-[19px] font-bold">Tablero base</h2>
            <p className="hint mt-1.5">
              El material fija medida, espesor y veta del proyecto. Se puede cambiar despues desde el editor.
            </p>
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <span className="field-label">Material / tablero</span>
            <div className="mt-1.5">
              <BoardPicker materials={materials} selectedId={materialId} onSelect={setMaterialId} />
            </div>
          </div>

          <div className="border-t border-[var(--line)] pt-4">
            <div className="eyebrow-muted">Paso 2</div>
            <h3 className="mt-1 text-[16px] font-bold">Datos del proyecto</h3>

            <div className="mt-3 grid gap-3">
              {requiresCustomer ? (
                <label className="block">
                  <span className="field-label">Cliente</span>
                  <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="input mt-1.5" required>
                    <option value="">Selecciona un cliente</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName} - {customer.email}</option>)}
                  </select>
                  <span className="hint mt-1 block">Si no existe, cargalo desde Clientes antes de crear el pedido.</span>
                </label>
              ) : null}
              <label className="block">
                <span className="field-label">Nombre</span>
                <input
                  name="name"
                  value={nameValue}
                  onChange={(event) => {
                    setNameEdited(true);
                    setName(event.target.value);
                  }}
                  className="input mt-1.5"
                  required
                  minLength={2}
                />
              </label>

              <label className="block">
                <span className="field-label">Descripcion</span>
                <textarea name="description" rows={3} className="textarea mt-1.5" />
              </label>

              <div className="border border-[var(--line)] bg-[#f7f9f7] p-3 text-sm">
                <div className="field-label">Parametros de corte del perfil de maquina</div>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <Detail label="Kerf" value={`${machineSettings.kerf} mm`} />
                  <Detail label="Refilado X" value={`${machineSettings.trimX} mm`} />
                  <Detail label="Refilado Y" value={`${machineSettings.trimY} mm`} />
                  <Detail label="Sobrante minimo" value={`${machineSettings.minRemnant} mm`} />
                  <Detail label="Corte minimo" value={`${machineSettings.minCutSize} mm`} />
                </div>
                <p className="hint mt-2">Estos valores se copian automaticamente al crear el proyecto.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <aside className="card h-fit overflow-hidden">
        <div className="relative aspect-[4/3] border-b border-[var(--line)] bg-[#dfe5df]">
          <MaterialImage src={selected?.imageUrl ?? null} alt={selected?.description ?? "Tablero"} />
        </div>
        <div className="space-y-3 p-4">
          <div>
            <div className="font-mono text-[10.5px] text-[var(--muted)]">{selected?.code ?? "Sin codigo"}</div>
            <h2 className="mt-1 text-[16px] font-bold leading-tight">{selected?.description ?? "Sin seleccion"}</h2>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <Detail label="Medida" value={selected ? selected.dimensionsLabel : "—"} />
            <Detail label="Espesor" value={selected ? `${selected.thickness} mm` : "—"} />
            <Detail label="Veta" value={selected ? (selected.hasGrain ? "Con veta" : "Sin veta") : "—"} />
            <Detail label="Catalogo" value={`${materials.length} tableros`} />
          </dl>
          {selected?.hasGrain ? (
            <p className="hint">
              Tablero con veta: las piezas mantienen su orientacion salvo que habilites la rotacion fila por fila.
            </p>
          ) : null}
          <PendingSubmitButton pendingLabel="Creando proyecto..." className="btn btn-primary focus-ring w-full">
            Crear proyecto
          </PendingSubmitButton>
        </div>
      </aside>
    </form>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="field-label">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
