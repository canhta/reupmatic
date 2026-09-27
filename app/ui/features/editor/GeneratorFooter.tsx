import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { VStack } from '@astryxdesign/core/VStack';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export interface GeneratorReadiness {
  /** The first blocking reason, translated. Absent when nothing blocks the primary. */
  reason?: string;
  checking?: boolean;
  canSetUp?: boolean;
  onSetUp?: () => void;
  onRefresh?: () => void;
}

// One readiness Banner above the primary, the running job's progress in its place, and the error
// with its copy instead of a raw code. Every generator panel composes it.
export function GeneratorFooter({
  readiness,
  active,
  error,
  errorLabel,
  cancel,
  children,
}: {
  readiness: GeneratorReadiness;
  active: { phase: string; fraction: number | null } | null;
  error: string;
  errorLabel: string;
  cancel: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <VStack gap={3}>
      {error && <Banner status="error" title={errorLabel} />}
      {active ? (
        <HStack gap={2} vAlign="center" role="status">
          <ProgressBar
            label={t(active.phase)}
            max={1}
            value={active.fraction ?? undefined}
            isIndeterminate={active.fraction === null}
          />
          <Button
            label={t('cancel')}
            isDisabled={active.phase === 'cancelling'}
            onClick={() => void cancel()}
          />
        </HStack>
      ) : (
        <>
          {readiness.reason && (
            <Banner
              status="warning"
              title={readiness.reason}
              endContent={
                <HStack gap={2}>
                  {readiness.canSetUp && (
                    <Button
                      size="sm"
                      variant="secondary"
                      label={t('setUp')}
                      onClick={readiness.onSetUp}
                    />
                  )}
                  {readiness.onRefresh && (
                    <Button
                      size="sm"
                      label={t('visionRefresh')}
                      isDisabled={readiness.checking}
                      onClick={readiness.onRefresh}
                    />
                  )}
                </HStack>
              }
            />
          )}
          {children}
        </>
      )}
    </VStack>
  );
}
