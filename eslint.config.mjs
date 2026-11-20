import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/**
 * Reglas de estilo y de errores comunes.
 *
 * La base es la configuracion oficial de Next con la capa de TypeScript. La
 * comprobacion de tipos la hace `npm run typecheck`, asi que aca no se repite:
 * lo que agrega el linter son los errores que el compilador no ve, como un
 * hook mal usado o una dependencia que falta en un efecto.
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "public/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      /**
       * Varios dialogos reinician su formulario cuando se abren, con un
       * useEffect que depende de `open`. React recomienda remontarlos con
       * `key` en lugar de eso. No es un error (el efecto sale temprano si el
       * dialogo esta cerrado y el render de mas es uno solo), pero sigue
       * siendo algo a mejorar, asi que queda como aviso a la vista y no
       * silenciado.
       */
      "react-hooks/set-state-in-effect": "warn",
      // Un valor sin usar es casi siempre un olvido; el prefijo _ lo permite.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
];

export default config;
