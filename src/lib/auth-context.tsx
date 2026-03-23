import {
	createContext,
	useContext,
	type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { authClient } from "./auth-client";

type Session = typeof authClient.$Infer.Session.session;
type User = typeof authClient.$Infer.Session.user;

interface AuthContextValue {
	session: Session;
	user: User;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const { data, isPending } = authClient.useSession();
	const navigate = useNavigate();

	if (isPending) {
		return (
			<div className="flex h-screen w-full items-center justify-center bg-[#191919]">
				<div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
			</div>
		);
	}

	if (!data) {
		navigate({ to: "/login" });
		return null;
	}

	return (
		<AuthContext.Provider value={{ session: data.session, user: data.user }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return ctx;
}
