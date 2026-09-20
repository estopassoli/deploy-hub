import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * Abas sublinhadas.
 *
 * A pílula `bg-muted p-1` de antes competia com o botão primário pela atenção e
 * escondia que abas são navegação, não ação. Aqui a aba ativa é um sublinhado de 2px
 * em accent — o mesmo emerald que significa "selecionado" no resto do produto.
 */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex h-10 items-stretch gap-5 border-b border-line-1 bg-transparent p-0",
      "max-xl:h-11 max-md:gap-4 max-md:overflow-x-auto",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-0.5 text-[13px] font-medium leading-5 text-text-3 transition-colors",
      "hover:text-text-2",
      "data-[state=active]:border-accent data-[state=active]:text-text-1",
      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/[0.18]",
      "max-xl:h-11 max-md:text-[15px]",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn("mt-6 focus-visible:outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
