import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { ClipboardCopy, FileText, FolderOpen, RefreshCw, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { ActionRow, AdaptiveSections, SettingPanel, SettingRow, SettingsGroup } from '../components/kit'
import type { SettingsViewModel } from './shared'

interface GpuDeviceInfo {
	index: number
	name: string
	description: string
	type: string
}

export function AdvancedSection({ vm, tab }: { vm: SettingsViewModel; tab: string }) {
	if (tab === 'logs') return <LogsTab vm={vm} />
	return <BehaviourTab vm={vm} />
}

function BehaviourTab({ vm }: { vm: SettingsViewModel }) {
	const preference = vm.preference

	return (
		<SettingsGroup title={m.modelMemory()} description={`${m.unloadModelAfterInactivityInfo()} ${m.zeroMeansNever()}`}>
			<SettingRow
				id="unloadTimeout"
				hideDescription
				control={
					<div className="flex items-center gap-2">
						<Input
							type="number"
							min={0}
							max={1440}
							step={1}
							value={preference.unloadTimeoutMinutes}
							onChange={(event) => {
								const minutes = Number(event.target.value)
								if (Number.isFinite(minutes)) preference.setUnloadTimeoutMinutes(Math.min(1440, Math.max(0, Math.floor(minutes))))
							}}
							className="h-9 w-24 tabular-nums"
						/>
						<span className="text-sm text-muted-foreground">{m.minutes()}</span>
					</div>
				}
			/>
		</SettingsGroup>
	)
}

function LogsTab({ vm }: { vm: SettingsViewModel }) {
	const [logs, setLogs] = useState<string | null>(null)
	const [diagnostics, setDiagnostics] = useState<string | null>(null)
	const [loadingDiagnostics, setLoadingDiagnostics] = useState(false)

	async function viewLogs() {
		try {
			const logText = await invoke<string>('get_logs')
			setLogs(logText.slice(-8000))
		} catch (error) {
			console.error(error)
			toast.error(m.viewLogsFailed())
		}
	}

	async function generateDiagnostics() {
		setLoadingDiagnostics(true)
		try {
			const devices = await invoke<GpuDeviceInfo[]>('get_gpu_devices')
			const logText = await invoke<string>('get_logs')
			const recentErrors = logText
				.split('\n')
				.filter((line) => line.toLowerCase().includes('error'))
				.slice(-5)
				.join('\n')
			const report = [
				`=== ${m.diagnosticsSystem()} ===`,
				`${m.diagnosticsDevices()}: ${devices.length > 0 ? devices.map((device) => `${device.name} (${device.type})`).join(', ') : m.none()}`,
				`${m.forceCpuMode()}: ${vm.preference.forceCpu}`,
				`${m.gpuDevice()}: ${vm.preference.gpuDevice ?? m.auto()}`,
				`${m.selectModel()}: ${vm.preference.modelPath ?? m.none()}`,
				'',
				`=== ${m.diagnosticsRecentErrors()} ===`,
				recentErrors || m.none(),
			].join('\n')
			setDiagnostics(report)
		} catch (error) {
			console.error(error)
			toast.error(m.diagnosticsFailed())
		} finally {
			setLoadingDiagnostics(false)
		}
	}

	return (
		<AdaptiveSections>
			<SettingsGroup title={m.logsAndDiagnostics()}>
				<SettingPanel id="logsAndDiagnostics" className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Button variant="secondary" size="sm" className="h-8 gap-1.5" onClick={viewLogs}>
							<FileText className="h-3.5 w-3.5" />
							{m.viewLogs()}
						</Button>
						<Button variant="secondary" size="sm" className="h-8 gap-1.5" onClick={generateDiagnostics} disabled={loadingDiagnostics}>
							<RefreshCw className={loadingDiagnostics ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
							{loadingDiagnostics ? m.generatingDiagnostics() : m.generateDiagnostics()}
						</Button>
					</div>
					{logs && <Textarea value={logs} readOnly className="max-h-64 min-h-[160px] w-full font-mono text-[11px]" />}
					{diagnostics && (
						<pre className="max-h-64 overflow-auto rounded-lg bg-muted/50 p-2.5 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
							{diagnostics}
						</pre>
					)}
				</SettingPanel>

				<ActionRow label={m.copyLogs()} onClick={vm.copyLogs} icon={<ClipboardCopy className="h-4 w-4 text-muted-foreground" />} />
				<ActionRow label={m.logsFolder()} onClick={vm.revealLogs} icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />} />
				<ActionRow label={m.tempFolder()} onClick={vm.revealTemp} icon={<FolderOpen className="h-4 w-4 text-muted-foreground" />} />
			</SettingsGroup>

			<SettingsGroup title={m.resetApp()} description={m.resetAppInfo()}>
				<ActionRow
					label={m.resetApp()}
					description={m.resetAppWarning()}
					onClick={vm.askAndReset}
					tone="destructive"
					icon={<RotateCcw className="h-4 w-4 text-destructive" />}
				/>
			</SettingsGroup>
		</AdaptiveSections>
	)
}
