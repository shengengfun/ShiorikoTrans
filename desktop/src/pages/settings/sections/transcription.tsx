import LanguageInput from '~/components/language-input'
import { SectionCard, type SettingsViewModel } from './shared'

export function TranscriptionSection({ vm }: { vm: SettingsViewModel }) {
	void vm

	return (
		<div className="space-y-5">
			<SectionCard>
				<LanguageInput />
			</SectionCard>
		</div>
	)
}
