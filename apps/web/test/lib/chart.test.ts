import { describe, expect, it } from 'vitest';
import {
  axisTicks,
  chartPath,
  chartX,
  chartY,
  layoutChart,
  projectValue,
  type ChartBox,
  type ChartLayout,
  type ChartValue,
} from '../../src/lib/chart';

/** Un lienzo con márgenes asimétricos: así un fallo de eje no se disimula por simetría. */
const BOX: ChartBox = {
  width: 360,
  height: 200,
  padding: { top: 12, right: 12, bottom: 24, left: 44 },
};

const LEFT = 44;
const RIGHT = 348;
const TOP = 12;
const BOTTOM = 176;

const MONDAY = Date.parse('2026-09-01T18:00:00.000Z');
const FRIDAY = Date.parse('2026-09-05T18:00:00.000Z');

function value(x: number, y: number): ChartValue {
  return { x, y };
}

/** La escala de un caso de prueba, que por construcción siempre tiene valores usables. */
function layoutOf(values: readonly ChartValue[]): ChartLayout {
  const layout = layoutChart(values, BOX);
  if (layout === null) throw new Error('El caso de prueba tiene que producir una escala');
  return layout;
}

describe('layoutChart', () => {
  it('sin valores no hay escala que resolver', () => {
    expect(layoutChart([], BOX)).toBeNull();
    expect(layoutChart([value(Number.NaN, Number.NaN)], BOX)).toBeNull();
  });

  it('descarta los valores que no son números finitos', () => {
    const layout = layoutOf([value(Number.NaN, 80_000), value(MONDAY, 80_000)]);

    expect(layout.xMin).toBe(MONDAY);
    expect(layout.xMax).toBe(MONDAY);
  });

  it('redondea el eje de pesos al salto que reconoce un levantador', () => {
    const layout = layoutOf([value(MONDAY, 81_000), value(FRIDAY, 84_500)]);

    expect(layout).toMatchObject({ yMin: 80_000, yMax: 85_000, yStep: 2_500 });
    expect(axisTicks(layout)).toEqual([80_000, 82_500, 85_000]);
  });

  it('da rango a un peso que no se mueve, para que la línea no salga pegada al borde', () => {
    const layout = layoutOf([value(MONDAY, 82_500), value(FRIDAY, 82_500)]);

    expect(layout).toMatchObject({ yMin: 82_000, yMax: 83_000, yStep: 1_000 });
    expect(chartY(layout, 82_500)).toBe((TOP + BOTTOM) / 2);
  });

  it('nunca baja el eje de cero, aunque el peso sea cero', () => {
    const layout = layoutOf([value(MONDAY, 0), value(FRIDAY, 0)]);

    expect(layout).toMatchObject({ yMin: 0, yMax: 1_000 });
  });

  it('ensancha el salto cuando el recorrido es grande', () => {
    const layout = layoutOf([value(MONDAY, 40_000), value(FRIDAY, 180_000)]);

    expect(layout.yStep).toBe(50_000);
    expect(axisTicks(layout)).toEqual([0, 50_000, 100_000, 150_000, 200_000]);
  });
});

describe('proyección', () => {
  const layout = layoutOf([value(MONDAY, 80_000), value(FRIDAY, 85_000)]);

  it('el primer instante cae en el margen izquierdo y el último en el derecho', () => {
    expect(chartX(layout, MONDAY)).toBe(LEFT);
    expect(chartX(layout, FRIDAY)).toBe(RIGHT);
  });

  it('el suelo del eje cae abajo y el techo arriba: el SVG crece al revés que el peso', () => {
    expect(chartY(layout, layout.yMin)).toBe(BOTTOM);
    expect(chartY(layout, layout.yMax)).toBe(TOP);
  });

  it('el punto medio del tiempo cae en el medio del área de trazo', () => {
    const midweek = MONDAY + (FRIDAY - MONDAY) / 2;
    expect(chartX(layout, midweek)).toBe((LEFT + RIGHT) / 2);
  });

  it('una sola sesión se pinta centrada en vez de dividir por cero', () => {
    const single = layoutOf([value(MONDAY, 80_000)]);
    expect(chartX(single, MONDAY)).toBe((LEFT + RIGHT) / 2);
  });

  it('proyecta un valor completo', () => {
    expect(projectValue(layout, value(MONDAY, layout.yMin))).toEqual({ x: LEFT, y: BOTTOM });
  });
});

describe('chartPath', () => {
  const layout = layoutOf([value(MONDAY, 80_000), value(FRIDAY, 85_000)]);

  it('escribe la línea en el orden en que llegan los valores', () => {
    const path = chartPath(layout, [value(MONDAY, 80_000), value(FRIDAY, 85_000)]);

    expect(path).toBe(`M${String(LEFT)} ${String(BOTTOM)} L${String(RIGHT)} ${String(TOP)}`);
  });

  it('un solo valor deja un `M` suelto y ninguno deja la cadena vacía', () => {
    expect(chartPath(layout, [value(MONDAY, 80_000)])).toBe(`M${String(LEFT)} ${String(BOTTOM)}`);
    expect(chartPath(layout, [])).toBe('');
  });

  it('se salta los valores ilegibles sin romper la línea', () => {
    const path = chartPath(layout, [
      value(MONDAY, 80_000),
      value(Number.NaN, 82_500),
      value(FRIDAY, 85_000),
    ]);

    expect(path).toBe(`M${String(LEFT)} ${String(BOTTOM)} L${String(RIGHT)} ${String(TOP)}`);
  });

  it('recorta los decimales que no se ven', () => {
    const path = chartPath(layout, [value(MONDAY + 1, 80_010)]);

    expect(path).toMatch(/^M\d+(?:\.\d{1,2})? \d+(?:\.\d{1,2})?$/);
  });
});
