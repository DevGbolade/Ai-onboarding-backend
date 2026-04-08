import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { EdgeType } from '../../common/enums/edge-type.enum';

@Entity('dependency_edges')
@Unique(['fromService', 'toService', 'edgeType', 'detail'])
export class DependencyEdgeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  fromService!: string;

  @Column()
  toService!: string;

  @Column({ type: 'enum', enum: EdgeType })
  edgeType!: EdgeType;

  @Column({ type: 'text', nullable: true })
  detail!: string | null;

  @CreateDateColumn()
  createdAt!: Date;
}
