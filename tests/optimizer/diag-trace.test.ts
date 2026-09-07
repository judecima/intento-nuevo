import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

const motor = require("../../src/lib/optimizer/legacy/motor.cjs") as {
  optimizar(lineas: unknown[], config: Record<string, unknown>): {
    placas: Array<{ colocadas: Array<{ _diagLink?: unknown }> }>;
    resumen: { placas: number };
  };
  resolverDiagPath(enlace: unknown): Array<Record<string, unknown>>;
};

const config = {
  placaBase: 2750,
  placaAltura: 1830,
  refiladoX: 10,
  refiladoY: 10,
  sierra: 4.5,
  materialConVeta: false,
  descontarCanto: false,
  cantoEspesor: 0,
  restoMin: 250,
  restoMax: 400,
  etapas: 4
};

const lineas = [
  { base: 600, altura: 400, cant: 12, detalle: "estante", veta: false, ref: 0 },
  { base: 1200, altura: 500, cant: 6, detalle: "lateral", veta: false, ref: 1 },
  { base: 350, altura: 280, cant: 9, detalle: "fondo", veta: false, ref: 2 }
];

function geometria(plan: ReturnType<typeof motor.optimizar>) {
  return JSON.stringify(
    plan.placas.map((placa) =>
      placa.colocadas.map((c) => {
        const { _diagLink, ...resto } = c as Record<string, unknown>;
        void _diagLink;
        return resto;
      })
    )
  );
}

/* La traza de diagnostico se construia para cada uno de los millones de planes
   intermedios que el motor descarta, y solo sobreviven las del plan final. Ahora es
   una lista enlazada y ademas se puede apagar durante la busqueda con trazaDiag.
   Estos tests fijan las dos propiedades que hacen seguro ese cambio. */
describe("traza de diagnostico", () => {
  it("apagarla no cambia la geometria del plan", () => {
    const con = motor.optimizar(
      lineas.map((l) => ({ ...l })),
      { ...config, trazaDiag: true, semilla: 7 }
    );
    const sin = motor.optimizar(
      lineas.map((l) => ({ ...l })),
      { ...config, trazaDiag: false, semilla: 7 }
    );

    expect(sin.resumen.placas).toBe(con.resumen.placas);
    expect(geometria(sin)).toBe(geometria(con));
  });

  it("con trazaDiag activa cada pieza tiene traza; apagada no tiene ninguna", () => {
    const con = motor.optimizar(
      lineas.map((l) => ({ ...l })),
      { ...config, trazaDiag: true, semilla: 7 }
    );
    const sin = motor.optimizar(
      lineas.map((l) => ({ ...l })),
      { ...config, trazaDiag: false, semilla: 7 }
    );

    const conPasos = con.placas.flatMap((p) =>
      p.colocadas.map((c) => motor.resolverDiagPath(c._diagLink).length)
    );
    const sinPasos = sin.placas.flatMap((p) =>
      p.colocadas.map((c) => motor.resolverDiagPath(c._diagLink).length)
    );

    expect(conPasos.length).toBeGreaterThan(0);
    expect(conPasos.every((n) => n > 0)).toBe(true);
    expect(sinPasos.every((n) => n === 0)).toBe(true);
  });

  it("resolverDiagPath devuelve los pasos de la raiz a la hoja", () => {
    const plan = motor.optimizar(
      lineas.map((l) => ({ ...l })),
      { ...config, trazaDiag: true, semilla: 7 }
    );
    const primera = plan.placas[0]?.colocadas[0];
    expect(primera).toBeDefined();

    const pasos = motor.resolverDiagPath(primera?._diagLink);
    expect(pasos.length).toBeGreaterThan(0);
    // El ultimo paso siempre es la colocacion de la pieza; los anteriores son cortes.
    expect(pasos[pasos.length - 1]?.tipo).toBe("COLOCACIÓN FINAL");
    // Los niveles no decrecen al bajar por el arbol.
    const niveles = pasos.map((p) => Number(p.nivel ?? 0));
    for (let i = 1; i < niveles.length; i++) {
      expect(niveles[i]).toBeGreaterThanOrEqual(niveles[i - 1]);
    }
  });

  it("es determinista: la misma semilla da la misma traza", () => {
    const a = motor.optimizar(lineas.map((l) => ({ ...l })), { ...config, semilla: 11 });
    const b = motor.optimizar(lineas.map((l) => ({ ...l })), { ...config, semilla: 11 });
    const trazas = (p: ReturnType<typeof motor.optimizar>) =>
      JSON.stringify(
        p.placas.flatMap((x) => x.colocadas.map((c) => motor.resolverDiagPath(c._diagLink)))
      );
    expect(trazas(b)).toBe(trazas(a));
  });
});
