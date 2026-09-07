import { useState } from 'react'
import { m } from '~/paraglide/messages.js'
import { InfoTooltip } from '~/components/info-tooltip'
import { Button } from '~/components/ui/button'
import { Switch } from '~/components/ui/switch'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { ReactComponent as CopyIcon } from '~/icons/copy.svg'
import { ReactComponent as FolderIcon } from '~/icons/folder.svg'
import { ReactComponent as ResetIcon } from '~/icons/reset.svg'
import { SectionCard, type SettingsViewModel } from './shared'
import { invoke } from '@tauri-apps/api/core'
import { toast } from 'sonner'

export function AdvancedSection({ vm }: { vm: SettingsViewModel }) {
	const [logs, setLogs] = useState<string | null>(null)
	const [diagnostics, setDiagnostics] = useState<string | null>(null)
	const [loadingDiagnostics, setLoadingDiagnostics] = useState(false)

	async function viewLogs() {
		try {
			const logText = await invoke<string>('get_logs')
			setLogs(logText.slice(-8000))
		} catch (error) {
			toast.error('加载日志失败')
		}
	}

	async function generateDiagnostics() {
		setLoadingDiagnostics(true)
		try {
			const devices = await invoke<Array<{ index: number; name: string; description: string; type: string }>>('get_gpu_devices')
			const logText = await invoke<string>('get_logs')
			const recentErrors = logText
				.split('\n')
				.filter((l) => l.toLowerCase().includes('error'))
				.slice(-5)
				.join('\n')
			const report = [
				'=== 系统诊断 ===',
				`GPU 设备: ${devices.length > 0 ? devices.map((d) => `${d.name} (${d.type})`).join(', ') : '无'}`,
				`强制 CPU: ${vm.preference.forceCpu}`,
				`选中 GPU: ${vm.preference.gpuDevice ?? '自动'}`,
				`模型: ${vm.preference.modelPath ?? '无'}`,
				'',
				'=== 近期错误 ===',
				recentErrors || '无近期错误',
			].join('\n')
			setDiagnostics(report)
		} catch (error) {
			toast.error('生成诊断信息失败')
		} finally {
			setLoadingDiagnostics(false)
		}
	}

	return (
		<div className="space-y-5">
			<div className="space-y-2">
				<div className="flex items-center gap-1 px-1">
					<InfoTooltip text={m.ytdlpOptionsInfo()} />
					<span className="text-sm font-semibold text-foreground/95">{m.ytdlpOptions()}</span>
				</div>
				<SectionCard>
					<div className="flex flex-wrap items-center justify-between gap-2">
					<span className="text-sm font-medium">{m.checkYtdlpUpdates()}</span>
					<Switch checked={vm.preference.shouldCheckYtDlpVersion} onCheckedChange={vm.preference.setShouldCheckYtDlpVersion} />
				</div>
			</SectionCard>
		</div>

		<div className="space-y-2">
			<div className="flex items-center gap-1 px-1">
				<InfoTooltip text={`${m.unloadModelAfterInactivityInfo()} ${m.zeroMeansNever()}`} />
				<span className="text-sm font-semibold text-foreground/95">{m.modelMemory()}</span>
			</div>
			<SectionCard>
				<div className="flex items-center justify-between gap-4">
					<span className="text-sm font-medium">{m.unloadModelAfterInactivity()}</span>
					<div className="flex items-center gap-2">
						<Input
							type="number"
							min={0}
							max={1440}
							step={1}
							value={vm.preference.unloadTimeoutMinutes}
							onChange={(event) => {
								const minutes = Number(event.target.value)
								if (Number.isFinite(minutes)) vm.preference.setUnloadTimeoutMinutes(Math.min(1440, Math.max(0, Math.floor(minutes))))
							}}
							className="h-6 w-20 rounded-lg px-2 py-0 text-right"
						/>
						<span className="text-sm text-muted-foreground">{m.minutes()}</span>
					</div>
				</div>
			</SectionCard>
		</div>

		<div className="space-y-2">
			<div className="flex items-center gap-1 px-1">
				<InfoTooltip text="实时查看应用日志" />
					<span className="text-sm font-semibold text-foreground/95">日志与诊断</span>
				</div>
				<SectionCard>
					<div className="space-y-4">
						<div className="flex gap-2">
							<Button variant="secondary" onClick={viewLogs} className="flex-1">查看日志</Button>
							<Button variant="secondary" onClick={generateDiagnostics} disabled={loadingDiagnostics} className="flex-1">
								{loadingDiagnostics ? '生成中...' : '生成诊断信息'}
							</Button>
						</div>
						{logs && (
							<Textarea
								value={logs}
								readOnly
								className="min-h-[160px] font-mono text-xs"
							/>
						)}
						{diagnostics && (
							<pre className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">{diagnostics}</pre>
						)}
					</div>
				</SectionCard>
			</div>

			<div className="divide-y divide-border/45 rounded-2xl border border-border/60 bg-card/92 shadow-xs">
				<Button variant="ghost" onMouseDown={vm.copyLogs} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{m.copyLogs()} <CopyIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onMouseDown={vm.revealLogs} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{m.logsFolder()} <FolderIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onMouseDown={vm.revealTemp} className="h-12 w-full justify-between rounded-none px-4 font-medium first:rounded-t-2xl last:rounded-b-2xl hover:bg-accent/55">{m.tempFolder()} <FolderIcon className="h-4 w-4 text-muted-foreground" /></Button>
				<Button variant="ghost" onClick={vm.askAndReset} className="h-12 w-full justify-between rounded-none px-4 font-medium text-destructive first:rounded-t-2xl last:rounded-b-2xl hover:bg-destructive/12 hover:text-destructive">{m.resetApp()} <ResetIcon className="h-5 w-5" /></Button>
			</div>
		</div>
	)
}
