import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Cpu, RefreshCw, ScanSearch } from 'lucide-react'
import { toast } from 'sonner'
import { m } from '~/paraglide/messages.js'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/components/ui/select'
import { Switch } from '~/components/ui/switch'
import { AdaptiveSections, EmptyHint, SettingPanel, SettingRow, SettingsGroup, StateBadge } from '../components/kit'
import type { SettingsViewModel } from './shared'

interface GpuDeviceInfo {
	index: number
	name: string
	description: string
	type: string
}

export function GpuSection({ vm, tab }: { vm: SettingsViewModel; tab: string }) {
	if (tab === 'diagnostics') return <DiagnosticsTab vm={vm} />
	return <AccelerationTab vm={vm} />
}

function AccelerationTab({ vm }: { vm: SettingsViewModel }) {
	const preference = vm.preference
	const requestedDevices = useRef(false)

	// Device enumeration spawns a helper process, so only pay for it once per
	// mount instead of on every render (`vm` is a fresh object each time).
	useEffect(() => {
		if (requestedDevices.current) return
		requestedDevices.current = true
		void vm.loadGpuDevices()
	}, [vm])

	return (
		<div className="space-y-5">
			<SettingsGroup title={m.hardwareAcceleration()} description={m.sectionGpuDesc()}>
				<SettingRow
					id="acceleratorDevice"
					control={
						vm.gpuDevices.length > 0 ? (
							<Select
								value={preference.gpuDevice != null ? String(preference.gpuDevice) : 'auto'}
								onValueChange={(value) => preference.setGpuDevice(value === 'auto' ? null : parseInt(value, 10))}>
								<SelectTrigger className="h-9 w-64">
									<SelectValue placeholder={m.gpuDevice()} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="auto">{m.auto()}</SelectItem>
									{vm.gpuDevices.map((device) => (
										<SelectItem key={device.index} value={String(device.index)}>
											{device.description}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<Input
								type="number"
								className="h-9 w-28 tabular-nums"
								value={preference.gpuDevice ?? ''}
								onChange={(event) => preference.setGpuDevice(event.target.value === '' ? null : parseInt(event.target.value, 10))}
								placeholder={m.gpuDevicePlaceholder()}
							/>
						)
					}
				/>
				<SettingRow id="forceCpu" control={<Switch checked={preference.forceCpu} onCheckedChange={preference.setForceCpu} />} />
				<SettingRow
					id="vulkanDevice"
					control={
						<Input
							type="number"
							className="h-9 w-28 tabular-nums"
							value={preference.vulkanDevice ?? ''}
							onChange={(event) => preference.setVulkanDevice(event.target.value === '' ? null : parseInt(event.target.value, 10))}
							placeholder={m.auto()}
						/>
					}
				/>
				<SettingRow
					id="modelQuantization"
					control={
						<Input
							className="h-9 w-40 font-mono text-xs"
							value={preference.modelQuantization}
							onChange={(event) => preference.setModelQuantization(event.target.value)}
							placeholder="auto"
						/>
					}
				/>
				<SettingRow id="enableDiagnostics" control={<Switch checked={preference.enableDiagnostics} onCheckedChange={preference.setEnableDiagnostics} />} />
			</SettingsGroup>
		</div>
	)
}

function DiagnosticsTab({ vm }: { vm: SettingsViewModel }) {
	const [detecting, setDetecting] = useState(false)
	const [devices, setDevices] = useState<GpuDeviceInfo[]>(vm.gpuDevices as GpuDeviceInfo[])
	const [vulkanInfo, setVulkanInfo] = useState<string[] | null>(null)

	async function detect() {
		setDetecting(true)
		try {
			const found = await invoke<GpuDeviceInfo[]>('get_gpu_devices')
			setDevices(found)
			vm.setGpuDevices(found as SettingsViewModel['gpuDevices'])
			if (found.length === 0) toast.warning(m.noGpuFound())
			else toast.success(m.gpuDetected({ count: String(found.length) }))
		} catch (error) {
			console.error('gpu detection failed:', error)
			toast.error(m.gpuDetectFailed())
		} finally {
			setDetecting(false)
		}
	}

	async function showVulkan() {
		try {
			const found = await invoke<GpuDeviceInfo[]>('get_gpu_devices')
			setVulkanInfo(found.map((device) => `${device.index}: ${device.description} (${device.type})`))
		} catch (error) {
			console.error('vulkan query failed:', error)
			setVulkanInfo([])
		}
	}

	return (
		<AdaptiveSections>
			<SettingsGroup title={m.gpuDiagnostics()}>
				<SettingPanel id="detectGpu" className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<Cpu className="h-4 w-4 shrink-0 text-muted-foreground" />
						<span className="text-sm font-medium">{m.detectedDevices()}</span>
						<StateBadge tone={devices.length > 0 ? 'primary' : 'muted'}>{String(devices.length)}</StateBadge>
						<Button variant="outline" size="sm" className="ms-auto h-8 gap-1.5" onClick={detect} disabled={detecting}>
							{detecting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
							{detecting ? m.detectingGpu() : m.detectGpu()}
						</Button>
					</div>
					{devices.length === 0 ? (
						<EmptyHint>{m.noGpuFound()}</EmptyHint>
					) : (
						<ul className="space-y-1">
							{devices.map((device) => (
								<li key={device.index} className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-2.5 py-1.5">
									<span className="font-mono text-[11px] text-muted-foreground">#{device.index}</span>
									<span className="min-w-0 flex-1 truncate text-sm" title={device.description}>
										{device.description}
									</span>
									<StateBadge>{device.type}</StateBadge>
								</li>
							))}
						</ul>
					)}
				</SettingPanel>
			</SettingsGroup>

			<SettingsGroup title={m.vulkanInfoTitle()}>
				<SettingPanel id="vulkanDevice">
					<Button variant="outline" size="sm" className="h-8" onClick={showVulkan}>
						{m.vulkanInfoTitle()}
					</Button>
					{vulkanInfo && (
						<pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-muted/50 p-2.5 font-mono text-[11px] text-muted-foreground">
							{vulkanInfo.length > 0 ? vulkanInfo.join('\n') : m.vulkanInfoNone()}
						</pre>
					)}
				</SettingPanel>
			</SettingsGroup>
		</AdaptiveSections>
	)
}
