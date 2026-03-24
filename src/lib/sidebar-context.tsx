import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface SidebarContextValue {
	isOpen: boolean;
	open: () => void;
	close: () => void;
	toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function SidebarProvider({ children }: { children: ReactNode }) {
	const [isOpen, setIsOpen] = useState(false);

	const open = useCallback(() => setIsOpen(true), []);
	const close = useCallback(() => setIsOpen(false), []);
	const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

	return (
		<SidebarContext.Provider value={{ isOpen, open, close, toggle }}>
			{children}
		</SidebarContext.Provider>
	);
}

export function useSidebar() {
	const context = useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider");
	}
	return context;
}
