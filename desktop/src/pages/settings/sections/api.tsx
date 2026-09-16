import { openUrl } from '@tauri-apps/plugin-opener'
import { Bot } from 'lucide-react'
import { m } from '~/paraglide/messages.js'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as LinkIcon } from '~/icons/link.svg'
import { Button } from '~/components/ui/button'
import { ActionRow, SettingsGroup, StateBadge } from '../components/kit'
import type { SettingsViewModel } from './shared'

/**
 * Local HTTP API: an OpenAI-ish surface plus an Agent Skill snippet so external
 * tools (and other agents) can drive the transcriber.
 */
export function ApiSection({ vm }: { vm: SettingsViewModel }) {
	const apiDocsUrl = vm.apiBaseUrl ? `${vm.apiBaseUrl}/docs` : null
	const serverActionBusy = vm.isStartingApiServer || vm.isStoppingApiServer

	return (
		<div className="space-y-5">
			<SettingsGroup title={m.apiAndAgents()} description={m.apiAgentsDescription()}>
				<div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
					<span
						className={`h-2 w-2 shrink-0 rounded-full ${
							vm.apiBaseUrl ? 'bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]' : 'bg-muted-foreground/40 shadow-[0_0_0_4px_rgba(148,163,184,0.12)]'
						}`}
					/>
					<div className="min-w-0 flex-1">
						<p className="text-sm font-semibold">{vm.apiBaseUrl ? m.apiServerRunning() : m.apiServerOff()}</p>
						{vm.apiBaseUrl && (
							<p className="truncate font-mono text-[11px] text-muted-foreground" title={vm.apiBaseUrl}>
								{vm.apiBaseUrl}
							</p>
						)}
					</div>
					<StateBadge tone={vm.apiBaseUrl ? 'primary' : 'muted'}>{vm.apiBaseUrl ? 'HTTP' : '—'}</StateBadge>
					<Button
						variant={vm.apiBaseUrl ? 'outline' : 'default'}
						size="sm"
						className="h-8 rounded-lg"
						onMouseDown={vm.apiBaseUrl ? vm.stopApiServer : vm.startApiServer}
						disabled={serverActionBusy}>
						{vm.isStartingApiServer ? m.apiStarting() : vm.isStoppingApiServer ? m.apiStopping() : vm.apiBaseUrl ? m.stop() : m.start()}
					</Button>
				</div>

				<div className={vm.apiBaseUrl ? undefined : 'pointer-events-none opacity-50'}>
					<ActionRow
						label={m.swaggerDocs()}
						onClick={() => (apiDocsUrl ? openUrl(apiDocsUrl) : null)}
						icon={<LinkIcon className="h-4 w-4 text-muted-foreground" />}
						disabled={!apiDocsUrl}
					/>
					<ActionRow
						label={m.copyCurlExample()}
						onClick={() => void vm.copyCurlExample()}
						icon={<CopyIcon className="h-4 w-4 text-muted-foreground" />}
						disabled={!vm.apiBaseUrl}
					/>
					<ActionRow
						label={m.copyAgentSkill()}
						onClick={() => void vm.copyAgentSkill()}
						icon={<Bot className="h-4 w-4 text-muted-foreground" />}
						disabled={!vm.apiBaseUrl}
					/>
				</div>
			</SettingsGroup>
		</div>
	)
}
