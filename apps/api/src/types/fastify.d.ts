import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    workspaceId: string;
    userId?: string;
    authType: 'api_key' | 'jwt';
    correlationId: string;
  }
}
