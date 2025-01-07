import TabItem from '@theme/TabItem';
import Tabs from '@theme/Tabs';
import React from 'react';

interface PackageInstallProps {
  dependencies?: string[];
  devDependencies?: string[];
}

export default function PackageInstall({ dependencies = [], devDependencies = [] }: PackageInstallProps) {
  const packageManagers = [
    {
      value: 'npm',
      label: 'npm',
      install: 'install',
      devFlag: '--save-dev',
    },
    {
      value: 'yarn',
      label: 'yarn',
      install: 'add',
      devFlag: '-D',
    },
    {
      value: 'pnpm',
      label: 'pnpm',
      install: 'add',
      devFlag: '-D',
    },
  ];

  return (
    <Tabs groupId="package-manager">
      {packageManagers.map(({ value, label, install, devFlag }) => (
        <TabItem key={value} value={value} label={label}>
          <pre>
            <code className="language-bash">
              {dependencies.length > 0 && `${value} ${install} ${dependencies.join(' ')}\n`}
              {devDependencies.length > 0 && `${value} ${install} ${devFlag} ${devDependencies.join(' ')}`}
            </code>
          </pre>
        </TabItem>
      ))}
    </Tabs>
  );
}
