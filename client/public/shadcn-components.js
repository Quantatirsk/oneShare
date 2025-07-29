// ShadCN UI Components for TSX Renderer
// 基于shadcn/ui样式的组件实现

const ShadcnUI = {
  Button: ({ children, className = "", variant = "default", size = "default", asChild = false, ...props }) => {
    const baseClasses = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
    
    const variantClasses = {
      default: "bg-primary text-primary-foreground hover:bg-primary/90",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      ghost: "hover:bg-accent hover:text-accent-foreground",
      link: "text-primary underline-offset-4 hover:underline"
    };
    
    const sizeClasses = {
      default: "h-10 px-4 py-2",
      sm: "h-9 rounded-md px-3",
      lg: "h-11 rounded-md px-8",
      icon: "h-10 w-10"
    };

    const finalClassName = `${baseClasses} ${variantClasses[variant] || variantClasses.default} ${sizeClasses[size] || sizeClasses.default} ${className}`;

    if (asChild && React.Children.count(children) === 1) {
      return React.cloneElement(children, {
        className: `${children.props.className || ""} ${finalClassName}`,
        ...props
      });
    }

    return React.createElement("button", {
      className: finalClassName,
      ...props
    }, children);
  },

  Card: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `rounded-lg border bg-card text-card-foreground shadow-sm ${className}`,
      ...props
    });
  },

  CardHeader: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col space-y-1.5 p-6 ${className}`,
      ...props
    });
  },

  CardTitle: ({ className = "", ...props }) => {
    return React.createElement("h3", {
      className: `text-2xl font-semibold leading-none tracking-tight ${className}`,
      ...props
    });
  },

  CardDescription: ({ className = "", ...props }) => {
    return React.createElement("p", {
      className: `text-sm text-muted-foreground ${className}`,
      ...props
    });
  },

  CardContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `p-6 pt-0 ${className}`,
      ...props
    });
  },

  CardFooter: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex items-center p-6 pt-0 ${className}`,
      ...props
    });
  },

  Badge: ({ className = "", variant = "default", ...props }) => {
    const baseClasses = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
    
    const variantClasses = {
      default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
      secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
      destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
      outline: "text-foreground"
    };

    return React.createElement("div", {
      className: `${baseClasses} ${variantClasses[variant] || variantClasses.default} ${className}`,
      ...props
    });
  },

  Separator: ({ className = "", orientation = "horizontal", decorative = true, ...props }) => {
    const orientationClasses = orientation === "vertical" 
      ? "h-full w-[1px]" 
      : "h-[1px] w-full";

    return React.createElement("div", {
      "data-orientation": orientation,
      role: decorative ? "none" : "separator",
      "aria-orientation": orientation,
      className: `shrink-0 bg-border ${orientationClasses} ${className}`,
      ...props
    });
  },

  Input: ({ className = "", type = "text", ...props }) => {
    return React.createElement("input", {
      type,
      className: `flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`,
      ...props
    });
  },

  Label: ({ className = "", ...props }) => {
    return React.createElement("label", {
      className: `text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`,
      ...props
    });
  },

  Textarea: ({ className = "", ...props }) => {
    return React.createElement("textarea", {
      className: `flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`,
      ...props
    });
  },

  Select: ({ children, ...props }) => {
    // 简化的Select实现
    return React.createElement("select", {
      className: "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      ...props
    }, children);
  },

  Progress: ({ value = 0, className = "", ...props }) => {
    return React.createElement("div", {
      className: `relative h-4 w-full overflow-hidden rounded-full bg-secondary ${className}`,
      ...props
    }, React.createElement("div", {
      className: "h-full w-full flex-1 bg-primary transition-all",
      style: { transform: `translateX(-${100 - (value || 0)}%)` }
    }));
  },

  Avatar: ({ className = "", ...props }) => {
    return React.createElement("span", {
      className: `relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full ${className}`,
      ...props
    });
  },

  AvatarImage: ({ className = "", ...props }) => {
    return React.createElement("img", {
      className: `aspect-square h-full w-full ${className}`,
      ...props
    });
  },

  AvatarFallback: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex h-full w-full items-center justify-center rounded-full bg-muted ${className}`,
      ...props
    });
  },

  Alert: ({ className = "", variant = "default", ...props }) => {
    const variantClasses = {
      default: "bg-background text-foreground",
      destructive: "border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive"
    };
    return React.createElement("div", {
      role: "alert",
      className: `relative w-full rounded-lg border p-4 [&:has(svg)]:pl-11 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground ${variantClasses[variant] || variantClasses.default} ${className}`,
      ...props
    });
  },

  AlertTitle: ({ className = "", ...props }) => {
    return React.createElement("h5", {
      className: `mb-1 font-medium leading-none tracking-tight ${className}`,
      ...props
    });
  },

  AlertDescription: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `text-sm [&_p]:leading-relaxed ${className}`,
      ...props
    });
  },

  Checkbox: ({ className = "", checked, ...props }) => {
    return React.createElement("button", {
      type: "button",
      role: "checkbox",
      "aria-checked": checked,
      "data-state": checked ? "checked" : "unchecked",
      className: `peer h-4 w-4 shrink-0 rounded-sm border border-primary ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground ${className}`,
      ...props
    }, checked && React.createElement("svg", {
      className: "h-4 w-4",
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    }, React.createElement("polyline", { points: "20,6 9,17 4,12" })));
  },

  // 更新Switch组件以匹配新版本
  Switch: ({ className = "", checked, ...props }) => {
    return React.createElement("button", {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      "data-state": checked ? "checked" : "unchecked",
      className: `peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-input dark:bg-input/80'} ${className}`,
      ...props
    }, React.createElement("span", {
      className: `pointer-events-none block size-4 rounded-full ring-0 transition-transform ${checked ? 'translate-x-[calc(100%-2px)] bg-background dark:bg-primary-foreground' : 'translate-x-0 bg-background dark:bg-foreground'}`,
      "data-state": checked ? "checked" : "unchecked"
    }));
  },

  Slider: ({ className = "", value = [0], min = 0, max = 100, step = 1, ...props }) => {
    const percentage = ((value[0] - min) / (max - min)) * 100;
    return React.createElement("span", {
      className: `relative flex w-full touch-none select-none items-center ${className}`,
      ...props
    }, React.createElement("span", {
      className: "relative h-2 w-full grow overflow-hidden rounded-full bg-secondary"
    }, React.createElement("span", {
      className: "absolute h-full bg-primary",
      style: { width: `${percentage}%` }
    }), React.createElement("span", {
      className: "block h-5 w-5 rounded-full border-2 border-primary bg-background ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 absolute -translate-x-1/2 -translate-y-1/2 top-1/2",
      style: { left: `${percentage}%` }
    })));
  },

  Table: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: "relative w-full overflow-auto"
    }, React.createElement("table", {
      className: `w-full caption-bottom text-sm ${className}`,
      ...props
    }));
  },

  TableHeader: ({ className = "", ...props }) => {
    return React.createElement("thead", {
      className: `[&_tr]:border-b ${className}`,
      ...props
    });
  },

  TableBody: ({ className = "", ...props }) => {
    return React.createElement("tbody", {
      className: `[&_tr:last-child]:border-0 ${className}`,
      ...props
    });
  },

  TableFooter: ({ className = "", ...props }) => {
    return React.createElement("tfoot", {
      className: `border-t bg-muted/50 font-medium [&>tr]:last:border-b-0 ${className}`,
      ...props
    });
  },

  TableRow: ({ className = "", ...props }) => {
    return React.createElement("tr", {
      className: `border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted ${className}`,
      ...props
    });
  },

  TableHead: ({ className = "", ...props }) => {
    return React.createElement("th", {
      className: `h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 ${className}`,
      ...props
    });
  },

  TableCell: ({ className = "", ...props }) => {
    return React.createElement("td", {
      className: `p-4 align-middle [&:has([role=checkbox])]:pr-0 ${className}`,
      ...props
    });
  },

  Tabs: ({ className = "", value, onValueChange, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-value": value,
      ...props
    }, children);
  },

  TabsList: ({ className = "", ...props }) => {
    return React.createElement("div", {
      role: "tablist",
      className: `inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground ${className}`,
      ...props
    });
  },

  TabsTrigger: ({ className = "", value, ...props }) => {
    return React.createElement("button", {
      type: "button",
      role: "tab",
      "data-value": value,
      className: `inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm ${className}`,
      ...props
    });
  },

  TabsContent: ({ className = "", value, ...props }) => {
    return React.createElement("div", {
      role: "tabpanel",
      "data-value": value,
      className: `mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${className}`,
      ...props
    });
  },

  Accordion: ({ className = "", type = "single", collapsible = false, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-type": type,
      "data-collapsible": collapsible,
      ...props
    });
  },

  AccordionItem: ({ className = "", value, ...props }) => {
    return React.createElement("div", {
      className: `border-b ${className}`,
      "data-value": value,
      ...props
    });
  },

  AccordionTrigger: ({ className = "", ...props }) => {
    return React.createElement("button", {
      type: "button",
      className: `flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180 ${className}`,
      ...props
    }, props.children, React.createElement("svg", {
      className: "h-4 w-4 shrink-0 transition-transform duration-200",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "6,9 12,15 18,9" })));
  },

  AccordionContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `overflow-hidden text-sm transition-all ${className}`,
      ...props
    }, React.createElement("div", {
      className: "pb-4 pt-0"
    }, props.children));
  },

  Dialog: ({ className = "", open, onOpenChange, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-state": open ? "open" : "closed",
      ...props
    }, children);
  },

  DialogTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  DialogContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    }, React.createElement("div", {
      role: "dialog",
      className: `relative z-50 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg ${className}`,
      ...props
    }));
  },

  DialogHeader: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col space-y-1.5 text-center sm:text-left ${className}`,
      ...props
    });
  },

  DialogFooter: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`,
      ...props
    });
  },

  DialogTitle: ({ className = "", ...props }) => {
    return React.createElement("h2", {
      className: `text-lg font-semibold leading-none tracking-tight ${className}`,
      ...props
    });
  },

  DialogDescription: ({ className = "", ...props }) => {
    return React.createElement("p", {
      className: `text-sm text-muted-foreground ${className}`,
      ...props
    });
  },

  Sheet: ({ className = "", side = "right", ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-side": side,
      ...props
    });
  },

  SheetTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  SheetContent: ({ className = "", side = "right", ...props }) => {
    const sideClasses = {
      top: "inset-x-0 top-0 border-b",
      bottom: "inset-x-0 bottom-0 border-t",
      left: "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
      right: "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm"
    };
    
    return React.createElement("div", {
      className: "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
    }, React.createElement("div", {
      className: `fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out ${sideClasses[side]} ${className}`,
      ...props
    }));
  },

  SheetHeader: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col space-y-2 text-center sm:text-left ${className}`,
      ...props
    });
  },

  SheetFooter: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`,
      ...props
    });
  },

  SheetTitle: ({ className = "", ...props }) => {
    return React.createElement("h2", {
      className: `text-lg font-semibold text-foreground ${className}`,
      ...props
    });
  },

  SheetDescription: ({ className = "", ...props }) => {
    return React.createElement("p", {
      className: `text-sm text-muted-foreground ${className}`,
      ...props
    });
  },

  DropdownMenu: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      ...props
    });
  },

  DropdownMenuTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  DropdownMenuContent: ({ className = "", align = "center", ...props }) => {
    return React.createElement("div", {
      className: `z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${className}`,
      "data-align": align,
      ...props
    });
  },

  DropdownMenuItem: ({ className = "", inset = false, ...props }) => {
    return React.createElement("div", {
      className: `relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${inset ? "pl-8" : ""} ${className}`,
      ...props
    });
  },

  DropdownMenuLabel: ({ className = "", inset = false, ...props }) => {
    return React.createElement("div", {
      className: `px-2 py-1.5 text-sm font-semibold ${inset ? "pl-8" : ""} ${className}`,
      ...props
    });
  },

  DropdownMenuSeparator: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `-mx-1 my-1 h-px bg-muted ${className}`,
      ...props
    });
  },

  RadioGroup: ({ className = "", ...props }) => {
    return React.createElement("div", {
      role: "radiogroup",
      className: `grid gap-2 ${className}`,
      ...props
    });
  },

  RadioGroupItem: ({ className = "", value, checked, ...props }) => {
    return React.createElement("button", {
      type: "button",
      role: "radio",
      "aria-checked": checked,
      "data-state": checked ? "checked" : "unchecked",
      value: value,
      className: `aspect-square h-4 w-4 rounded-full border border-primary text-primary ring-offset-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`,
      ...props
    }, React.createElement("span", {
      className: "flex items-center justify-center"
    }, checked && React.createElement("span", {
      className: "h-2.5 w-2.5 rounded-full bg-current"
    })));
  },

  AlertDialog: ({ className = "", open, onOpenChange, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-state": open ? "open" : "closed",
      ...props
    }, children);
  },

  AlertDialogTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  AlertDialogContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    }, React.createElement("div", {
      role: "alertdialog",
      className: `relative z-50 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg ${className}`,
      ...props
    }));
  },

  AlertDialogHeader: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col space-y-2 text-center sm:text-left ${className}`,
      ...props
    });
  },

  AlertDialogFooter: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 ${className}`,
      ...props
    });
  },

  AlertDialogTitle: ({ className = "", ...props }) => {
    return React.createElement("h2", {
      className: `text-lg font-semibold ${className}`,
      ...props
    });
  },

  AlertDialogDescription: ({ className = "", ...props }) => {
    return React.createElement("p", {
      className: `text-sm text-muted-foreground ${className}`,
      ...props
    });
  },

  AlertDialogAction: ({ className = "", ...props }) => {
    return React.createElement("button", {
      className: `inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground ring-offset-background transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${className}`,
      ...props
    });
  },

  AlertDialogCancel: ({ className = "", ...props }) => {
    return React.createElement("button", {
      className: `inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${className}`,
      ...props
    });
  },

  Popover: ({ className = "", open, onOpenChange, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-state": open ? "open" : "closed",
      ...props
    }, children);
  },

  PopoverTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  PopoverContent: ({ className = "", align = "center", side = "bottom", ...props }) => {
    return React.createElement("div", {
      className: `z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none ${className}`,
      "data-side": side,
      "data-align": align,
      ...props
    });
  },

  HoverCard: ({ className = "", openDelay = 700, closeDelay = 300, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-open-delay": openDelay,
      "data-close-delay": closeDelay,
      ...props
    }, children);
  },

  HoverCardTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "span";
    return React.createElement(Comp, asChild ? {} : {
      className: `${className}`,
      ...props
    }, props.children);
  },

  HoverCardContent: ({ className = "", align = "center", side = "bottom", ...props }) => {
    return React.createElement("div", {
      className: `z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none ${className}`,
      "data-side": side,
      "data-align": align,
      ...props
    });
  },

  Tooltip: ({ className = "", delayDuration = 700, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-delay-duration": delayDuration,
      ...props
    }, children);
  },

  TooltipTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  TooltipContent: ({ className = "", side = "top", align = "center", ...props }) => {
    return React.createElement("div", {
      className: `z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md ${className}`,
      "data-side": side,
      "data-align": align,
      ...props
    });
  },

  ContextMenu: ({ className = "", children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      ...props
    }, children);
  },

  ContextMenuTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "div";
    return React.createElement(Comp, asChild ? {} : {
      className: `${className}`,
      ...props
    }, props.children);
  },

  ContextMenuContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg ${className}`,
      ...props
    });
  },

  ContextMenuItem: ({ className = "", inset = false, ...props }) => {
    return React.createElement("div", {
      className: `relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${inset ? "pl-8" : ""} ${className}`,
      ...props
    });
  },

  ContextMenuSeparator: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `-mx-1 my-1 h-px bg-border ${className}`,
      ...props
    });
  },

  MenuBar: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex h-10 items-center space-x-1 rounded-md border bg-background p-1 ${className}`,
      ...props
    });
  },

  MenuBarMenu: ({ className = "", children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      ...props
    }, children);
  },

  MenuBarTrigger: ({ className = "", ...props }) => {
    return React.createElement("button", {
      type: "button",
      className: `flex cursor-default select-none items-center rounded-sm px-3 py-1.5 text-sm font-medium outline-none focus:bg-accent data-[state=open]:bg-accent ${className}`,
      ...props
    });
  },

  MenuBarContent: ({ className = "", align = "start", ...props }) => {
    return React.createElement("div", {
      className: `z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${className}`,
      "data-align": align,
      ...props
    });
  },

  MenuBarItem: ({ className = "", inset = false, ...props }) => {
    return React.createElement("div", {
      className: `relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${inset ? "pl-8" : ""} ${className}`,
      ...props
    });
  },

  NavigationMenu: ({ className = "", ...props }) => {
    return React.createElement("nav", {
      className: `relative z-10 flex max-w-max flex-1 items-center justify-center ${className}`,
      ...props
    });
  },

  NavigationMenuList: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `group flex flex-1 list-none items-center justify-center space-x-1 ${className}`,
      ...props
    });
  },

  NavigationMenuItem: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      ...props
    });
  },

  NavigationMenuTrigger: ({ className = "", ...props }) => {
    return React.createElement("button", {
      type: "button",
      className: `group inline-flex h-10 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-[active]:bg-accent/50 data-[state=open]:bg-accent/50 ${className}`,
      ...props
    }, props.children, React.createElement("svg", {
      className: "relative top-[1px] ml-1 h-3 w-3 transition duration-200 group-data-[state=open]:rotate-180",
      "aria-hidden": "true",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "6,9 12,15 18,9" })));
  },

  NavigationMenuContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `left-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 md:absolute md:w-auto ${className}`,
      ...props
    });
  },

  NavigationMenuLink: ({ className = "", ...props }) => {
    return React.createElement("a", {
      className: `block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${className}`,
      ...props
    });
  },

  Calendar: ({ className = "", selected, onSelect, ...props }) => {
    return React.createElement("div", {
      className: `p-3 ${className}`,
      ...props
    }, React.createElement("div", {
      className: "space-y-4"
    }, React.createElement("div", {
      className: "relative"
    }, React.createElement("div", {
      className: "rounded-md border"
    }, React.createElement("div", {
      className: "space-y-4 p-3"
    }, React.createElement("div", {
      className: "grid grid-cols-7 gap-2"
    }, ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => 
      React.createElement("div", {
        key: day,
        className: "flex h-9 w-9 items-center justify-center text-sm"
      }, day)
    )), React.createElement("div", {
      className: "grid grid-cols-7 gap-2"
    }, Array.from({ length: 35 }, (_, i) => 
      React.createElement("button", {
        key: i,
        type: "button",
        className: "relative flex h-9 w-9 items-center justify-center rounded-md text-sm hover:bg-accent hover:text-accent-foreground"
      }, i + 1)
    )))))));
  },

  Command: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground ${className}`,
      ...props
    });
  },

  CommandInput: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: "flex items-center border-b px-3"
    }, React.createElement("input", {
      className: `flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 ${className}`,
      ...props
    }));
  },

  CommandList: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `max-h-[300px] overflow-y-auto overflow-x-hidden ${className}`,
      ...props
    });
  },

  CommandEmpty: ({ className = "", children = "No results found.", ...props }) => {
    return React.createElement("div", {
      className: `py-6 text-center text-sm ${className}`,
      ...props
    }, children);
  },

  CommandGroup: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `overflow-hidden p-1 text-foreground ${className}`,
      ...props
    });
  },

  CommandItem: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`,
      ...props
    });
  },

  CommandSeparator: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `-mx-1 h-px bg-border ${className}`,
      ...props
    });
  },

  Collapsible: ({ className = "", open, onOpenChange, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-state": open ? "open" : "closed",
      ...props
    }, children);
  },

  CollapsibleTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  CollapsibleContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down ${className}`,
      ...props
    });
  },

  // 新增组件 - AspectRatio
  AspectRatio: ({ className = "", ratio = 16 / 9, children, ...props }) => {
    return React.createElement("div", {
      className: `relative w-full ${className}`,
      style: { paddingBottom: `${100 / ratio}%` },
      ...props
    }, React.createElement("div", {
      className: "absolute inset-0"
    }, children));
  },

  // 新增组件 - Breadcrumb系列
  Breadcrumb: ({ className = "", ...props }) => {
    return React.createElement("nav", {
      "aria-label": "breadcrumb",
      className: `${className}`,
      ...props
    });
  },

  BreadcrumbList: ({ className = "", ...props }) => {
    return React.createElement("ol", {
      className: `text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5 ${className}`,
      ...props
    });
  },

  BreadcrumbItem: ({ className = "", ...props }) => {
    return React.createElement("li", {
      className: `inline-flex items-center gap-1.5 ${className}`,
      ...props
    });
  },

  BreadcrumbLink: ({ className = "", ...props }) => {
    return React.createElement("a", {
      className: `hover:text-foreground transition-colors ${className}`,
      ...props
    });
  },

  BreadcrumbPage: ({ className = "", ...props }) => {
    return React.createElement("span", {
      role: "link",
      "aria-disabled": "true",
      "aria-current": "page",
      className: `text-foreground font-normal ${className}`,
      ...props
    });
  },

  BreadcrumbSeparator: ({ className = "", children, ...props }) => {
    return React.createElement("li", {
      role: "presentation",
      "aria-hidden": "true",
      className: `[&>svg]:size-3.5 ${className}`,
      ...props
    }, children || React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "9,18 15,12 9,6" })));
  },

  BreadcrumbEllipsis: ({ className = "", ...props }) => {
    return React.createElement("span", {
      role: "presentation",
      "aria-hidden": "true",
      className: `flex size-9 items-center justify-center ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "size-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("circle", { cx: "12", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "19", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "5", cy: "12", r: "1" })),
       React.createElement("span", { className: "sr-only" }, "More"));
  },

  // 新增组件 - InputOTP系列
  InputOTP: ({ className = "", containerClassName = "", maxLength = 6, ...props }) => {
    return React.createElement("div", {
      className: `flex items-center gap-2 has-disabled:opacity-50 ${containerClassName}`,
      ...props
    });
  },

  InputOTPGroup: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex items-center ${className}`,
      ...props
    });
  },

  InputOTPSlot: ({ className = "", index = 0, ...props }) => {
    return React.createElement("div", {
      className: `relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md border-input ${className}`,
      ...props
    });
  },

  InputOTPSeparator: ({ className = "", ...props }) => {
    return React.createElement("div", {
      role: "separator",
      className: `${className}`,
      ...props
    }, React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" })));
  },

  // 新增组件 - Pagination系列
  Pagination: ({ className = "", ...props }) => {
    return React.createElement("nav", {
      role: "navigation",
      "aria-label": "pagination",
      className: `mx-auto flex w-full justify-center ${className}`,
      ...props
    });
  },

  PaginationContent: ({ className = "", ...props }) => {
    return React.createElement("ul", {
      className: `flex flex-row items-center gap-1 ${className}`,
      ...props
    });
  },

  PaginationItem: ({ className = "", ...props }) => {
    return React.createElement("li", {
      className: `${className}`,
      ...props
    });
  },

  PaginationLink: ({ className = "", isActive = false, size = "icon", ...props }) => {
    const baseClasses = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
    const variantClasses = isActive 
      ? "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
      : "hover:bg-accent hover:text-accent-foreground";
    const sizeClasses = size === "icon" ? "h-9 w-9" : "h-9 px-4 py-2";
    
    return React.createElement("a", {
      "aria-current": isActive ? "page" : undefined,
      className: `${baseClasses} ${variantClasses} ${sizeClasses} ${className}`,
      ...props
    });
  },

  PaginationPrevious: ({ className = "", ...props }) => {
    return React.createElement("a", {
      "aria-label": "Go to previous page",
      className: `inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 gap-1 px-2.5 sm:pl-2.5 ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "15,18 9,12 15,6" })),
       React.createElement("span", { className: "hidden sm:block" }, "Previous"));
  },

  PaginationNext: ({ className = "", ...props }) => {
    return React.createElement("a", {
      "aria-label": "Go to next page", 
      className: `inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 gap-1 px-2.5 sm:pr-2.5 ${className}`,
      ...props
    }, React.createElement("span", { className: "hidden sm:block" }, "Next"),
       React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "9,18 15,12 9,6" })));
  },

  PaginationEllipsis: ({ className = "", ...props }) => {
    return React.createElement("span", {
      "aria-hidden": "true",
      className: `flex size-9 items-center justify-center ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "size-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("circle", { cx: "12", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "19", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "5", cy: "12", r: "1" })),
       React.createElement("span", { className: "sr-only" }, "More pages"));
  },

  // 新增组件 - Skeleton
  Skeleton: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `bg-accent animate-pulse rounded-md ${className}`,
      ...props
    });
  },

  // 新增组件 - Toggle
  Toggle: ({ className = "", variant = "default", size = "default", pressed = false, ...props }) => {
    const baseClasses = "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground";
    
    const variantClasses = {
      default: "bg-transparent hover:bg-muted hover:text-muted-foreground",
      outline: "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground"
    };
    
    const sizeClasses = {
      default: "h-9 px-2 min-w-9",
      sm: "h-8 px-1.5 min-w-8", 
      lg: "h-10 px-2.5 min-w-10"
    };

    return React.createElement("button", {
      type: "button",
      role: "switch",
      "aria-pressed": pressed,
      "data-state": pressed ? "on" : "off",
      className: `${baseClasses} ${variantClasses[variant] || variantClasses.default} ${sizeClasses[size] || sizeClasses.default} ${className}`,
      ...props
    });
  },

  // 新增组件 - ToggleGroup
  ToggleGroup: ({ className = "", variant = "default", size = "default", ...props }) => {
    return React.createElement("div", {
      role: "group",
      className: `flex w-fit items-center rounded-md ${variant === 'outline' ? 'shadow-xs' : ''} ${className}`,
      "data-variant": variant,
      "data-size": size,
      ...props
    });
  },

  ToggleGroupItem: ({ className = "", variant = "default", size = "default", pressed = false, ...props }) => {
    const baseClasses = "inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10";
    
    const variantClasses = {
      default: "bg-transparent hover:bg-muted hover:text-muted-foreground",
      outline: "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground border-l-0 first:border-l"
    };
    
    const sizeClasses = {
      default: "h-9 px-2 min-w-9",
      sm: "h-8 px-1.5 min-w-8",
      lg: "h-10 px-2.5 min-w-10"
    };

    return React.createElement("button", {
      type: "button",
      role: "switch",
      "aria-pressed": pressed,
      "data-state": pressed ? "on" : "off",
      className: `${baseClasses} ${variantClasses[variant] || variantClasses.default} ${sizeClasses[size] || sizeClasses.default} ${className}`,
      ...props
    });
  },

  // 新增组件 - ScrollArea
  ScrollArea: ({ className = "", children, ...props }) => {
    return React.createElement("div", {
      className: `relative ${className}`,
      ...props
    }, React.createElement("div", {
      className: "size-full rounded-[inherit] overflow-auto"
    }, children), React.createElement("div", {
      className: "flex touch-none p-px transition-colors select-none h-full w-2.5 border-l border-l-transparent absolute right-0 top-0"
    }, React.createElement("div", {
      className: "bg-border relative flex-1 rounded-full"
    })));
  },

  // 新增组件 - ResizablePanel系列
  ResizablePanel: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      ...props
    });
  },

  ResizablePanelGroup: ({ className = "", direction = "horizontal", ...props }) => {
    return React.createElement("div", {
      className: `flex h-full w-full ${direction === 'vertical' ? 'flex-col' : ''} ${className}`,
      "data-panel-group-direction": direction,
      ...props
    });
  },

  ResizableHandle: ({ className = "", withHandle = false, ...props }) => {
    return React.createElement("div", {
      className: `bg-border relative flex w-px items-center justify-center focus-visible:ring-ring focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-none ${className}`,
      ...props
    }, withHandle && React.createElement("div", {
      className: "bg-border z-10 flex h-4 w-3 items-center justify-center rounded-xs border"
    }, React.createElement("svg", {
      className: "size-2.5",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("circle", { cx: "9", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "15", cy: "12", r: "1" }))));
  },

  // 新增组件 - DatePicker (简化版)
  DatePicker: ({ className = "", selected, onSelect, placeholder = "Pick a date", ...props }) => {
    return React.createElement("button", {
      type: "button",
      className: `flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 justify-between ${className}`,
      ...props
    }, selected ? selected.toLocaleDateString() : React.createElement("span", {
      className: "text-muted-foreground"
    }, placeholder), React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("rect", { x: "3", y: "4", width: "18", height: "18", rx: "2", ry: "2" }),
       React.createElement("line", { x1: "16", y1: "2", x2: "16", y2: "6" }),
       React.createElement("line", { x1: "8", y1: "2", x2: "8", y2: "6" }),
       React.createElement("line", { x1: "3", y1: "10", x2: "21", y2: "10" })));
  },

  // 新增组件 - Drawer (简化版)
  Drawer: ({ className = "", open, onOpenChange, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-state": open ? "open" : "closed",
      ...props
    }, children);
  },

  DrawerTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  DrawerContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
    }, React.createElement("div", {
      className: `fixed bottom-0 left-0 right-0 z-50 mt-24 flex h-auto flex-col rounded-t-[10px] border bg-background ${className}`,
      ...props
    }));
  },

  DrawerHeader: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `grid gap-1.5 p-4 text-center sm:text-left ${className}`,
      ...props
    });
  },

  DrawerFooter: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `mt-auto flex flex-col gap-2 p-4 ${className}`,
      ...props
    });
  },

  DrawerTitle: ({ className = "", ...props }) => {
    return React.createElement("h2", {
      className: `text-lg font-semibold leading-none tracking-tight ${className}`,
      ...props
    });
  },

  DrawerDescription: ({ className = "", ...props }) => {
    return React.createElement("p", {
      className: `text-sm text-muted-foreground ${className}`,
      ...props
    });
  },

  // 新增组件 - Typography
  Typography: ({ className = "", variant = "p", children, ...props }) => {
    const variants = {
      h1: { tag: "h1", class: "scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl" },
      h2: { tag: "h2", class: "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0" },
      h3: { tag: "h3", class: "scroll-m-20 text-2xl font-semibold tracking-tight" },
      h4: { tag: "h4", class: "scroll-m-20 text-xl font-semibold tracking-tight" },
      p: { tag: "p", class: "leading-7 [&:not(:first-child)]:mt-6" },
      blockquote: { tag: "blockquote", class: "mt-6 border-l-2 pl-6 italic" },
      code: { tag: "code", class: "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold" },
      lead: { tag: "p", class: "text-xl text-muted-foreground" },
      large: { tag: "div", class: "text-lg font-semibold" },
      small: { tag: "small", class: "text-sm font-medium leading-none" },
      muted: { tag: "p", class: "text-sm text-muted-foreground" }
    };

    const config = variants[variant] || variants.p;
    
    return React.createElement(config.tag, {
      className: `${config.class} ${className}`,
      ...props
    }, children);
  },

  // 新增组件 - Combobox (简化版)
  Combobox: ({ className = "", placeholder = "Search...", options = [], value, onValueChange, ...props }) => {
    return React.createElement("div", {
      className: `relative ${className}`,
      ...props
    }, React.createElement("button", {
      type: "button",
      role: "combobox",
      "aria-expanded": false,
      className: "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    }, value ? options.find(option => option.value === value)?.label || value : React.createElement("span", {
      className: "text-muted-foreground"
    }, placeholder), React.createElement("svg", {
      className: "h-4 w-4 opacity-50",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "6,9 12,15 18,9" }))));
  },

  // 新增组件 - DataTable (简化版)
  DataTable: ({ className = "", columns = [], data = [], ...props }) => {
    return React.createElement("div", {
      className: `relative w-full overflow-auto ${className}`,
      ...props
    }, React.createElement("table", {
      className: "w-full caption-bottom text-sm"
    }, React.createElement("thead", {
      className: "[&_tr]:border-b"
    }, React.createElement("tr", {
      className: "border-b transition-colors hover:bg-muted/50"
    }, columns.map((column, index) => 
      React.createElement("th", {
        key: index,
        className: "h-12 px-4 text-left align-middle font-medium text-muted-foreground"
      }, column.header)
    ))), React.createElement("tbody", {
      className: "[&_tr:last-child]:border-0"
    }, data.map((row, rowIndex) =>
      React.createElement("tr", {
        key: rowIndex,
        className: "border-b transition-colors hover:bg-muted/50"
      }, columns.map((column, colIndex) =>
        React.createElement("td", {
          key: colIndex,
          className: "p-4 align-middle"
        }, row[column.accessorKey] || "")
      ))
    ))));
  },

  // 新增组件 - Carousel (简化版，不依赖Embla)
  Carousel: ({ className = "", children, ...props }) => {
    return React.createElement("div", {
      className: `relative ${className}`,
      role: "region",
      "aria-roledescription": "carousel",
      ...props
    }, children);
  },

  CarouselContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: "overflow-hidden"
    }, React.createElement("div", {
      className: `flex -ml-4 ${className}`,
      ...props
    }));
  },

  CarouselItem: ({ className = "", ...props }) => {
    return React.createElement("div", {
      role: "group",
      "aria-roledescription": "slide",
      className: `min-w-0 shrink-0 grow-0 basis-full pl-4 ${className}`,
      ...props
    });
  },

  CarouselPrevious: ({ className = "", ...props }) => {
    return React.createElement("button", {
      type: "button",
      variant: "outline",
      className: `absolute size-8 rounded-full top-1/2 -left-12 -translate-y-1/2 border border-input bg-background hover:bg-accent hover:text-accent-foreground ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "15,18 9,12 15,6" })),
       React.createElement("span", { className: "sr-only" }, "Previous slide"));
  },

  CarouselNext: ({ className = "", ...props }) => {
    return React.createElement("button", {
      type: "button",
      variant: "outline", 
      className: `absolute size-8 rounded-full top-1/2 -right-12 -translate-y-1/2 border border-input bg-background hover:bg-accent hover:text-accent-foreground ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24", 
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "9,18 15,12 9,6" })),
       React.createElement("span", { className: "sr-only" }, "Next slide"));
  },

  // 新增组件 - Toast (简化版)
  Toast: ({ className = "", variant = "default", ...props }) => {
    const variantClasses = {
      default: "bg-background text-foreground",
      destructive: "destructive group border-destructive bg-destructive text-destructive-foreground"
    };
    
    return React.createElement("div", {
      className: `group pointer-events-auto relative flex w-full items-center justify-between space-x-4 overflow-hidden rounded-md border p-6 pr-8 shadow-lg transition-all ${variantClasses[variant] || variantClasses.default} ${className}`,
      ...props
    });
  },

  ToastAction: ({ className = "", ...props }) => {
    return React.createElement("button", {
      className: `inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 text-sm font-medium ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 group-[.destructive]:border-muted/40 group-[.destructive]:hover:border-destructive/30 group-[.destructive]:hover:bg-destructive group-[.destructive]:hover:text-destructive-foreground group-[.destructive]:focus:ring-destructive ${className}`,
      ...props
    });
  },

  ToastClose: ({ className = "", ...props }) => {
    return React.createElement("button", {
      className: `absolute top-2 right-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100 group-[.destructive]:text-red-300 group-[.destructive]:hover:text-red-50 group-[.destructive]:focus:ring-red-400 group-[.destructive]:focus:ring-offset-red-600 ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
       React.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" })));
  },

  ToastTitle: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `text-sm font-semibold ${className}`,
      ...props
    });
  },

  ToastDescription: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `text-sm opacity-90 ${className}`,
      ...props
    });
  },

  // 新增组件 - Sonner Toast Provider
  Toaster: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `toaster group ${className}`,
      ...props
    });
  },

  // 新增组件 - Chart系列 (简化版)
  ChartContainer: ({ className = "", config = {}, children, ...props }) => {
    return React.createElement("div", {
      className: `flex aspect-video justify-center text-xs ${className}`,
      ...props
    }, children);
  },

  ChartTooltip: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `border-border/50 bg-background grid min-w-[8rem] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs shadow-xl ${className}`,
      ...props
    });
  },

  ChartTooltipContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `grid gap-1.5 ${className}`,
      ...props
    });
  },

  ChartLegend: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex items-center justify-center gap-4 pt-3 ${className}`,
      ...props
    });
  },

  ChartLegendContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex items-center gap-1.5 ${className}`,
      ...props
    });
  },

  // 新增组件 - Command系列 (简化版)
  Command: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground ${className}`,
      ...props
    });
  },

  CommandInput: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: "flex items-center border-b px-3"
    }, React.createElement("input", {
      className: `flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 ${className}`,
      ...props
    }));
  },

  CommandList: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `max-h-[300px] overflow-y-auto overflow-x-hidden ${className}`,
      ...props
    });
  },

  CommandEmpty: ({ className = "", children = "No results found.", ...props }) => {
    return React.createElement("div", {
      className: `py-6 text-center text-sm ${className}`,
      ...props
    }, children);
  },

  CommandGroup: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `overflow-hidden p-1 text-foreground ${className}`,
      ...props
    });
  },

  CommandItem: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`,
      ...props
    });
  },

  CommandSeparator: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `-mx-1 h-px bg-border ${className}`,
      ...props
    });
  },

  // 新增组件 - Collapsible系列 (简化版)
  Collapsible: ({ className = "", open = false, onOpenChange, children, ...props }) => {
    return React.createElement("div", {
      className: `${className}`,
      "data-state": open ? "open" : "closed",
      ...props
    }, children);
  },

  CollapsibleTrigger: ({ className = "", asChild = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `${className}`,
      ...props
    }, props.children);
  },

  CollapsibleContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `overflow-hidden transition-all ${className}`,
      ...props
    });
  },

  // 新增组件 - 简化的Sidebar系列
  SidebarProvider: ({ className = "", children, ...props }) => {
    return React.createElement("div", {
      className: `flex min-h-screen w-full ${className}`,
      ...props
    }, children);
  },

  Sidebar: ({ className = "", side = "left", ...props }) => {
    return React.createElement("div", {
      className: `bg-sidebar text-sidebar-foreground flex h-screen w-64 flex-col border-r ${className}`,
      "data-side": side,
      ...props
    });
  },

  SidebarHeader: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col gap-2 p-4 ${className}`,
      ...props
    });
  },

  SidebarContent: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-2 ${className}`,
      ...props
    });
  },

  SidebarFooter: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex flex-col gap-2 p-4 ${className}`,
      ...props
    });
  },

  SidebarTrigger: ({ className = "", ...props }) => {
    return React.createElement("button", {
      type: "button",
      className: `inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-7 w-7 ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("rect", { x: "3", y: "3", width: "18", height: "18", rx: "2", ry: "2" }),
       React.createElement("line", { x1: "9", y1: "9", x2: "15", y2: "15" }),
       React.createElement("line", { x1: "15", y1: "9", x2: "9", y2: "15" })),
       React.createElement("span", { className: "sr-only" }, "Toggle Sidebar"));
  },

  SidebarMenu: ({ className = "", ...props }) => {
    return React.createElement("ul", {
      className: `flex w-full min-w-0 flex-col gap-1 ${className}`,
      ...props
    });
  },

  SidebarMenuItem: ({ className = "", ...props }) => {
    return React.createElement("li", {
      className: `group/menu-item relative ${className}`,
      ...props
    });
  },

  SidebarMenuButton: ({ className = "", asChild = false, isActive = false, ...props }) => {
    const Comp = asChild ? React.Fragment : "button";
    return React.createElement(Comp, asChild ? {} : {
      type: "button",
      className: `flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${isActive ? 'bg-accent text-accent-foreground font-medium' : ''} ${className}`,
      "data-active": isActive,
      ...props
    }, props.children);
  },

  SidebarInset: ({ className = "", ...props }) => {
    return React.createElement("main", {
      className: `relative flex flex-1 flex-col bg-background ${className}`,
      ...props
    });
  },  MenuBarContent: ({ className = "", align = "start", ...props }) => {
    return React.createElement("div", {
      className: `z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${className}`,
      "data-align": align,
      ...props
    });
  },

  MenuBarItem: ({ className = "", inset = false, ...props }) => {
    return React.createElement("div", {
      className: `relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${inset ? "pl-8" : ""} ${className}`,
      ...props
    });
  },

  // 新增组件 - AspectRatio
  AspectRatio: ({ className = "", ratio = 16 / 9, children, ...props }) => {
    return React.createElement("div", {
      className: `relative w-full ${className}`,
      style: { paddingBottom: `${100 / ratio}%` },
      ...props
    }, React.createElement("div", {
      className: "absolute inset-0"
    }, children));
  },

  // 新增组件 - Breadcrumb系列
  Breadcrumb: ({ className = "", ...props }) => {
    return React.createElement("nav", {
      "aria-label": "breadcrumb",
      className: `${className}`,
      ...props
    });
  },

  BreadcrumbList: ({ className = "", ...props }) => {
    return React.createElement("ol", {
      className: `text-muted-foreground flex flex-wrap items-center gap-1.5 text-sm break-words sm:gap-2.5 ${className}`,
      ...props
    });
  },

  BreadcrumbItem: ({ className = "", ...props }) => {
    return React.createElement("li", {
      className: `inline-flex items-center gap-1.5 ${className}`,
      ...props
    });
  },

  BreadcrumbLink: ({ className = "", ...props }) => {
    return React.createElement("a", {
      className: `hover:text-foreground transition-colors ${className}`,
      ...props
    });
  },

  BreadcrumbPage: ({ className = "", ...props }) => {
    return React.createElement("span", {
      role: "link",
      "aria-disabled": "true",
      "aria-current": "page",
      className: `text-foreground font-normal ${className}`,
      ...props
    });
  },

  BreadcrumbSeparator: ({ className = "", children, ...props }) => {
    return React.createElement("li", {
      role: "presentation",
      "aria-hidden": "true",
      className: `[&>svg]:size-3.5 ${className}`,
      ...props
    }, children || React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "9,18 15,12 9,6" })));
  },

  BreadcrumbEllipsis: ({ className = "", ...props }) => {
    return React.createElement("span", {
      role: "presentation",
      "aria-hidden": "true",
      className: `flex size-9 items-center justify-center ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "size-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("circle", { cx: "12", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "19", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "5", cy: "12", r: "1" })),
       React.createElement("span", { className: "sr-only" }, "More"));
  },

  // 新增组件 - InputOTP系列
  InputOTP: ({ className = "", containerClassName = "", maxLength = 6, ...props }) => {
    return React.createElement("div", {
      className: `flex items-center gap-2 has-disabled:opacity-50 ${containerClassName}`,
      ...props
    });
  },

  InputOTPGroup: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `flex items-center ${className}`,
      ...props
    });
  },

  InputOTPSlot: ({ className = "", index = 0, ...props }) => {
    return React.createElement("div", {
      className: `relative flex h-9 w-9 items-center justify-center border-y border-r text-sm shadow-xs transition-all outline-none first:rounded-l-md first:border-l last:rounded-r-md border-input ${className}`,
      ...props
    });
  },

  InputOTPSeparator: ({ className = "", ...props }) => {
    return React.createElement("div", {
      role: "separator",
      className: `${className}`,
      ...props
    }, React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" })));
  },

  // 新增组件 - Pagination系列
  Pagination: ({ className = "", ...props }) => {
    return React.createElement("nav", {
      role: "navigation",
      "aria-label": "pagination",
      className: `mx-auto flex w-full justify-center ${className}`,
      ...props
    });
  },

  PaginationContent: ({ className = "", ...props }) => {
    return React.createElement("ul", {
      className: `flex flex-row items-center gap-1 ${className}`,
      ...props
    });
  },

  PaginationItem: ({ className = "", ...props }) => {
    return React.createElement("li", {
      className: `${className}`,
      ...props
    });
  },

  PaginationLink: ({ className = "", isActive = false, size = "icon", ...props }) => {
    const baseClasses = "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
    const variantClasses = isActive 
      ? "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
      : "hover:bg-accent hover:text-accent-foreground";
    const sizeClasses = size === "icon" ? "h-9 w-9" : "h-9 px-4 py-2";
    
    return React.createElement("a", {
      "aria-current": isActive ? "page" : undefined,
      className: `${baseClasses} ${variantClasses} ${sizeClasses} ${className}`,
      ...props
    });
  },

  PaginationPrevious: ({ className = "", ...props }) => {
    return React.createElement("a", {
      "aria-label": "Go to previous page",
      className: `inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 gap-1 px-2.5 sm:pl-2.5 ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "15,18 9,12 15,6" })),
       React.createElement("span", { className: "hidden sm:block" }, "Previous"));
  },

  PaginationNext: ({ className = "", ...props }) => {
    return React.createElement("a", {
      "aria-label": "Go to next page", 
      className: `inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 gap-1 px-2.5 sm:pr-2.5 ${className}`,
      ...props
    }, React.createElement("span", { className: "hidden sm:block" }, "Next"),
       React.createElement("svg", {
      className: "h-4 w-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("polyline", { points: "9,18 15,12 9,6" })));
  },

  PaginationEllipsis: ({ className = "", ...props }) => {
    return React.createElement("span", {
      "aria-hidden": "true",
      className: `flex size-9 items-center justify-center ${className}`,
      ...props
    }, React.createElement("svg", {
      className: "size-4",
      fill: "none",
      viewBox: "0 0 24 24",
      stroke: "currentColor",
      strokeWidth: "2"
    }, React.createElement("circle", { cx: "12", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "19", cy: "12", r: "1" }),
       React.createElement("circle", { cx: "5", cy: "12", r: "1" })),
       React.createElement("span", { className: "sr-only" }, "More pages"));
  },

  // 新增组件 - Skeleton
  Skeleton: ({ className = "", ...props }) => {
    return React.createElement("div", {
      className: `bg-accent animate-pulse rounded-md ${className}`,
      ...props
    });
  },

  // 新增组件 - Toggle
  Toggle: ({ className = "", variant = "default", size = "default", pressed = false, ...props }) => {
    const baseClasses = "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground";
    
    const variantClasses = {
      default: "bg-transparent hover:bg-muted hover:text-muted-foreground",
      outline: "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground"
    };
    
    const sizeClasses = {
      default: "h-9 px-2 min-w-9",
      sm: "h-8 px-1.5 min-w-8", 
      lg: "h-10 px-2.5 min-w-10"
    };

    return React.createElement("button", {
      type: "button",
      role: "switch",
      "aria-pressed": pressed,
      "data-state": pressed ? "on" : "off",
      className: `${baseClasses} ${variantClasses[variant] || variantClasses.default} ${sizeClasses[size] || sizeClasses.default} ${className}`,
      ...props
    });
  },

  // 新增组件 - ToggleGroup
  ToggleGroup: ({ className = "", variant = "default", size = "default", ...props }) => {
    return React.createElement("div", {
      role: "group",
      className: `flex w-fit items-center rounded-md ${variant === 'outline' ? 'shadow-xs' : ''} ${className}`,
      "data-variant": variant,
      "data-size": size,
      ...props
    });
  },

  ToggleGroupItem: ({ className = "", variant = "default", size = "default", pressed = false, ...props }) => {
    const baseClasses = "inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground min-w-0 flex-1 shrink-0 rounded-none shadow-none first:rounded-l-md last:rounded-r-md focus:z-10";
    
    const variantClasses = {
      default: "bg-transparent hover:bg-muted hover:text-muted-foreground",
      outline: "border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground border-l-0 first:border-l"
    };
    
    const sizeClasses = {
      default: "h-9 px-2 min-w-9",
      sm: "h-8 px-1.5 min-w-8",
      lg: "h-10 px-2.5 min-w-10"
    };

    return React.createElement("button", {
      type: "button",
      role: "switch",
      "aria-pressed": pressed,
      "data-state": pressed ? "on" : "off",
      className: `${baseClasses} ${variantClasses[variant] || variantClasses.default} ${sizeClasses[size] || sizeClasses.default} ${className}`,
      ...props
    });
  },

  // 更新Switch组件以匹配新版本
  Switch: ({ className = "", checked, ...props }) => {
    return React.createElement("button", {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      "data-state": checked ? "checked" : "unchecked",
      className: `peer inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-input dark:bg-input/80'} ${className}`,
      ...props
    }, React.createElement("span", {
      className: `pointer-events-none block size-4 rounded-full ring-0 transition-transform ${checked ? 'translate-x-[calc(100%-2px)] bg-background dark:bg-primary-foreground' : 'translate-x-0 bg-background dark:bg-foreground'}`,
      "data-state": checked ? "checked" : "unchecked"
    }));
  },
};

// 导出为ES模块
export default ShadcnUI;
export { ShadcnUI };

// 同时支持全局访问
if (typeof window !== 'undefined') {
  window.ShadcnUI = ShadcnUI;
}