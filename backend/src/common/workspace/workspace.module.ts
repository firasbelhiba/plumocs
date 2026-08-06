import { Global, Module } from '@nestjs/common';
import { WorkspaceBindingInterceptor } from './workspace-binding.interceptor';
import { WorkspaceContextService } from './workspace-context.service';

/**
 * Global for the same reason PrismaModule is: tenant resolution is needed by the
 * auth guard, by services and by every worker processor, and threading it
 * through twenty module imports would guarantee that the one module which forgot
 * it ends up querying unscoped.
 */
@Global()
@Module({
  providers: [WorkspaceContextService, WorkspaceBindingInterceptor],
  // The interceptor is exported rather than registered here: only the API
  // process wants it (see AppModule), and the worker must not have one.
  exports: [WorkspaceContextService, WorkspaceBindingInterceptor],
})
export class WorkspaceModule {}
