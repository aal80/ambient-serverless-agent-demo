TF := cd terraform && AWS_PROFILE=test1 terraform

build:
	cd producer && npm ci --omit=dev
	cd webapp && npm ci --omit=dev

deploy: build
	$(TF) init
	$(TF) apply --auto-approve

destroy:
	$(TF) destroy --auto-approve

watch:
	$(eval PRODUCER_FUNCTION_NAME := $(shell cat ./tmp/PRODUCER_FUNCTION_NAME.txt))
	$(eval APPSYNC_HTTP_DOMAIN := $(shell cat ./tmp/APPSYNC_HTTP_DOMAIN.txt))
	$(eval APPSYNC_REALTIME_DOMAIN := $(shell cat ./tmp/APPSYNC_REALTIME_DOMAIN.txt))
	$(eval APPSYNC_API_KEY := $(shell cat ./tmp/APPSYNC_API_KEY.txt))
	$(eval SECRET_ARN := $(shell cat ./tmp/SECRET_ARN.txt))
	cd webapp && \
	AWS_PROFILE=test1 AWS_REGION=us-east-1 \
	PRODUCER_FUNCTION_NAME=$(PRODUCER_FUNCTION_NAME) \
	APPSYNC_HTTP_DOMAIN=$(APPSYNC_HTTP_DOMAIN) \
	APPSYNC_REALTIME_DOMAIN=$(APPSYNC_REALTIME_DOMAIN) \
	APPSYNC_API_KEY=$(APPSYNC_API_KEY) \
	SECRET_ARN=$(SECRET_ARN) \
	nodemon