import { LuCheck, LuHardDrive, LuLoaderCircle } from 'react-icons/lu';
import { SiTiktok } from 'react-icons/si';

type StageCopy = {
  label: string;
  title: string;
  source: string;
  processing: string;
  output: string;
  downloaded: string;
  ready: string;
  current: string;
  queued: string;
  tasks: readonly string[];
  files: readonly string[];
  summary: string;
  local: string;
};

export function AlphaStage({ copy }: { copy: StageCopy }) {
  return (
    <div className="alpha-stage" role="img" aria-label={copy.label}>
      <div className="stage-heading" aria-hidden="true">
        <strong>{copy.title}</strong>
        <span>
          <i />
          Alpha
        </span>
      </div>

      <div className="stage-flow" aria-hidden="true">
        <section className="stage-sources">
          <h2>{copy.source}</h2>
          {copy.files.map((file, index) => (
            <div className={`source-row source-row-${index + 1}`} key={file}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{file}</strong>
                <small>
                  {index === 0 ? copy.downloaded : index === 1 ? copy.ready : copy.queued}
                </small>
              </div>
            </div>
          ))}
        </section>

        <section className="stage-process">
          <h2>{copy.processing}</h2>
          <div className="process-video">
            <span className="video-mark">
              <SiTiktok />
            </span>
            <div className="video-frame">
              <i />
              <i />
              <b />
            </div>
          </div>
          <ol>
            {copy.tasks.map((task, index) => (
              <li className={index < 2 ? 'is-done' : 'is-current'} key={task}>
                <span>{index < 2 ? <LuCheck /> : <LuLoaderCircle />}</span>
                {task}
              </li>
            ))}
          </ol>
        </section>

        <section className="stage-output">
          <h2>{copy.output}</h2>
          <div className="output-count">
            <strong>02</strong>
            <span>{copy.ready}</span>
          </div>
          <div className="output-progress">
            <i />
          </div>
          <p>{copy.summary}</p>
          <small>
            <LuHardDrive />
            {copy.local}
          </small>
        </section>
      </div>
    </div>
  );
}
