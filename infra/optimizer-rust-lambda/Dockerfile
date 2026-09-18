FROM public.ecr.aws/lambda/nodejs:22 AS build

RUN dnf install -y gcc gcc-c++ make curl && dnf clean all
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR ${LAMBDA_TASK_ROOT}
COPY native/optimizer-pattern-generator ./native/optimizer-pattern-generator
COPY scripts/install-rust-pattern-generator.mjs ./scripts/install-rust-pattern-generator.mjs
RUN cargo build --manifest-path native/optimizer-pattern-generator/Cargo.toml --release \
 && node scripts/install-rust-pattern-generator.mjs

FROM public.ecr.aws/lambda/nodejs:22
ENV OPTIMIZER_REPO_ROOT=${LAMBDA_TASK_ROOT}

COPY --from=build ${LAMBDA_TASK_ROOT}/native/optimizer-pattern-generator/optimizer_pattern_generator.node \
  ${LAMBDA_TASK_ROOT}/native/optimizer-pattern-generator/optimizer_pattern_generator.node
COPY src/lib/optimizer/legacy ${LAMBDA_TASK_ROOT}/src/lib/optimizer/legacy
COPY infra/optimizer-rust-lambda/handler.cjs ${LAMBDA_TASK_ROOT}/handler.cjs

CMD ["handler.handler"]
