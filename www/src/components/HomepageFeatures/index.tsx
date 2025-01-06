import type { ReactNode } from 'react';
import { Button } from '@site/src/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@site/src/components/ui/card';
import { cn } from '@site/src/lib/utils';
import DocusaurusMountain from '@site/static/img/undraw_docusaurus_mountain.svg';
import DocusaurusReact from '@site/static/img/undraw_docusaurus_react.svg';
import DocusaurusTree from '@site/static/img/undraw_docusaurus_tree.svg';
import styles from './styles.module.css';

type FeatureItem = {
  title: string;
  Svg: React.ComponentType<React.ComponentProps<'svg'>>;
  description: ReactNode;
  buttonText: string;
};

const FeatureList: FeatureItem[] = [
  {
    title: 'Easy to Use',
    Svg: DocusaurusMountain,
    description: (
      <>
        Docusaurus was designed from the ground up to be easily installed and used to get your website up and running
        quickly.
      </>
    ),
    buttonText: 'Get Started',
  },
  {
    title: 'Focus on What Matters',
    Svg: DocusaurusTree,
    description: (
      <>
        Docusaurus lets you focus on your docs, and we&apos;ll do the chores. Go ahead and move your docs into the{' '}
        <code>docs</code> directory.
      </>
    ),
    buttonText: 'Learn More',
  },
  {
    title: 'Powered by React',
    Svg: DocusaurusReact,
    description: (
      <>
        Extend or customize your website layout by reusing React. Docusaurus can be extended while reusing the same
        header and footer.
      </>
    ),
    buttonText: 'Explore',
  },
];

function Feature({ title, Svg, description, buttonText }: FeatureItem) {
  return (
    <div className={cn('col col--4')}>
      <Card className="h-full">
        <CardHeader>
          <div className="text--center mb-4">
            <Svg className={styles.featureSvg} role="img" />
          </div>
          <CardTitle className="text--center">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription className="text--center">{description}</CardDescription>
        </CardContent>
        <CardFooter className="justify-center pb-6">
          <Button variant="outline" className="bg-secondary">
            {buttonText}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
