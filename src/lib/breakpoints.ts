/**
 * Os dois limiares do **shell**.
 *
 * O shell (sidebar / rail / tab bar) responde ao viewport; o **conteúdo** responde ao
 * container (`@container` no `<main>`). São coisas diferentes de propósito: foi a
 * sidebar de 256px comendo 31% de um tablet de 834px que produziu a maior parte dos
 * defeitos de layout — com container queries, um componente numa janela estreita se
 * comporta como se estivesse num celular, independente do tamanho da tela.
 *
 * Estes números aparecem em dois lugares: aqui e nos breakpoints `md`/`xl` do Tailwind.
 * São os padrões do Tailwind justamente para não haver um terceiro.
 */

/** A sidebar de 240px entra só em `xl`. */
export const DESKTOP_MIN = 1280;

/** Abaixo disto é celular; entre os dois, rail de 64px. */
export const TABLET_MIN = 768;

/**
 * Por que a sidebar entra em `xl:` e não em `lg:`
 *
 * A tabela de 7 colunas precisa de 880px (748 de colunas + 6 gaps de 16 + 36 de
 * padding). Com a sidebar de 240px em 1024px sobrariam 784px: a tabela não caberia e a
 * tela cairia no layout de tablet com o shell de desktop — o pior dos dois mundos. Em
 * 1280px sobram 1040px. Entre 1024 e 1279 o rail de 64px deixa 960px, que comporta a
 * tabela inteira.
 */
export const TABLE_DESKTOP_MIN = 880;
