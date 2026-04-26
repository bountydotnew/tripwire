import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import RootProvider from "#/integrations/tanstack-query/root-provider";
import { AutumnProvider } from "autumn-js/react";
import { ToastProvider, AnchoredToastProvider } from "#/components/ui/toast";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{ title: "Tripwire" },
		],
		links: [
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous",
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;520;600;700&display=swap",
			},
			{ rel: "stylesheet", href: appCss },
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<RootProvider>
					<AutumnProvider useBetterAuth>
						<ToastProvider>
							<AnchoredToastProvider>
								{children}
							</AnchoredToastProvider>
						</ToastProvider>
					</AutumnProvider>
				</RootProvider>
				<Scripts />
			</body>
		</html>
	);
}
