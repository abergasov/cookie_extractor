run: run_owner
	@for i in {1..100}; do \
		echo "Iteration $$i"; \
		yarn run dev; \
		sleep 60; \
	done

run_owner: ## Generate cookie for owner only
	@echo "-- runn owner"
	yarn run owner
